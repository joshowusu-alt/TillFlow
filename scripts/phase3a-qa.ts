import { PrismaClient } from '@prisma/client';
import {
  checkMobileMoneyCollectionStatus,
  handleMobileMoneyWebhook,
  initiateMobileMoneyCollection,
} from '../lib/services/mobile-money';
import { createSale } from '../lib/services/sales';
import { createSalesReturn } from '../lib/services/returns';
import { createStockAdjustment } from '../lib/services/inventory';
import { ensureOrganizationAndBranches } from '../lib/services/branches';
import { approveAndCompleteStockTransfer, requestStockTransfer } from '../lib/services/stock-transfers';

const prisma = new PrismaClient();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function getSellableLine(businessId: string, storeId: string) {
  const balance = await prisma.inventoryBalance.findFirst({
    where: {
      storeId,
      qtyOnHandBase: { gte: 10 },
      product: {
        businessId,
        active: true,
        sellingPriceBasePence: { gt: 0 },
        promoBuyQty: 0,
        promoGetQty: 0,
      },
    },
    select: {
      productId: true,
      product: {
        select: {
          sellingPriceBasePence: true,
          vatRateBps: true,
          productUnits: {
            where: { isBaseUnit: true },
            select: { unitId: true, conversionToBase: true },
            take: 1,
          },
        },
      },
    },
  });

  if (!balance || balance.product.productUnits.length === 0) {
    throw new Error('No sellable product with a base unit was found.');
  }

  const conversionToBase = balance.product.productUnits[0].conversionToBase;
  const unitPricePence = balance.product.sellingPriceBasePence * conversionToBase;
  return {
    productId: balance.productId,
    unitId: balance.product.productUnits[0].unitId,
    approxUnitPrice: balance.product.sellingPriceBasePence,
    unitPricePence,
    vatRateBps: balance.product.vatRateBps,
  };
}

async function closeOpenShiftsForTill(tillId: string) {
  await prisma.shift.updateMany({
    where: { tillId, status: 'OPEN' },
    data: {
      status: 'CLOSED',
      closedAt: new Date(),
      actualCashPence: 0,
      variance: 0,
    },
  });
}

async function run() {
  const report = {
    momo: {
      initiatePending: false,
      idempotency: false,
      pollConfirm: false,
      webhookConfirm: false,
      saleLinkedWithRef: false,
      failedCollectionBlocked: false,
    },
    cashIntegrity: {
      blocksSaleWithoutOpenTill: false,
      expectedCashMath: false,
    },
    fraud: {
      voidRequiresPinAndReason: false,
      highDiscountRequiresApproval: false,
      riskAlertsIncrement: false,
    },
    branchTransfer: {
      organizationMapped: false,
      stockMovesBetweenBranches: false,
      movementLogsCreated: false,
    },
  };

  let originalBusinessSettings: {
    requireOpenTillForSales: boolean;
    discountApprovalThresholdBps: number;
    inventoryAdjustmentRiskThresholdBase: number;
  } | null = null;
  let restoreBusinessId: string | null = null;

  try {
    const business = await prisma.business.findFirst({
      select: {
        id: true,
        name: true,
        currency: true,
        vatEnabled: true,
        requireOpenTillForSales: true,
        discountApprovalThresholdBps: true,
        inventoryAdjustmentRiskThresholdBase: true,
      },
    });
    if (!business) throw new Error('Business not found.');
    restoreBusinessId = business.id;
    originalBusinessSettings = {
      requireOpenTillForSales: business.requireOpenTillForSales,
      discountApprovalThresholdBps: business.discountApprovalThresholdBps,
      inventoryAdjustmentRiskThresholdBase: business.inventoryAdjustmentRiskThresholdBase,
    };

    const [owner, cashier, customer, mainStore] = await Promise.all([
      prisma.user.findFirst({
        where: { businessId: business.id, role: 'OWNER', active: true },
        select: { id: true },
      }),
      prisma.user.findFirst({
        where: { businessId: business.id, role: 'CASHIER', active: true },
        select: { id: true },
      }),
      prisma.customer.findFirst({
        where: { businessId: business.id },
        select: { id: true },
      }),
      prisma.store.findFirst({
        where: { businessId: business.id },
        select: { id: true, name: true },
      }),
    ]);

    assert(owner, 'Owner user not found.');
    assert(cashier, 'Cashier user not found.');
    assert(customer, 'Customer not found.');
    assert(mainStore, 'Primary store not found.');

    const till = await prisma.till.findFirst({
      where: { storeId: mainStore.id, active: true },
      select: { id: true },
    });
    assert(till, 'Active till not found.');

    const saleLine = await getSellableLine(business.id, mainStore.id);
    const momoExactAmount =
      saleLine.unitPricePence +
      (business.vatEnabled ? Math.round((saleLine.unitPricePence * saleLine.vatRateBps) / 10_000) : 0);

    // ---------------------------------------------------------------------
    // MoMo payment suite
    // ---------------------------------------------------------------------
    const idemKey = `qa-momo-${Date.now()}`;
    const collectionA = await initiateMobileMoneyCollection({
      businessId: business.id,
      storeId: mainStore.id,
      initiatedByUserId: owner.id,
      amountPence: momoExactAmount,
      currency: business.currency,
      payerMsisdn: '0241111222',
      network: 'MTN',
      provider: 'MTN',
      idempotencyKey: idemKey,
    });
    const collectionARepeat = await initiateMobileMoneyCollection({
      businessId: business.id,
      storeId: mainStore.id,
      initiatedByUserId: owner.id,
      amountPence: momoExactAmount,
      currency: business.currency,
      payerMsisdn: '0241111222',
      network: 'MTN',
      provider: 'MTN',
      idempotencyKey: idemKey,
    });
    assert(collectionA.status === 'PENDING', 'MoMo initiate should start as pending.');
    assert(collectionA.id === collectionARepeat.id, 'MoMo idempotency key did not dedupe request.');
    report.momo.initiatePending = true;
    report.momo.idempotency = true;

    const polled = await checkMobileMoneyCollectionStatus({
      businessId: business.id,
      collectionId: collectionA.id,
      force: true,
    });
    assert(polled.status === 'CONFIRMED', 'MoMo polling did not reach confirmed.');
    report.momo.pollConfirm = true;

    const webhookCollection = await initiateMobileMoneyCollection({
      businessId: business.id,
      storeId: mainStore.id,
      initiatedByUserId: owner.id,
      amountPence: momoExactAmount,
      currency: business.currency,
      payerMsisdn: '0241111333',
      network: 'MTN',
      provider: 'MTN',
      idempotencyKey: `qa-momo-webhook-${Date.now()}`,
    });
    await handleMobileMoneyWebhook({
      providerKey: webhookCollection.provider,
      headers: {},
      body: {
        referenceId: webhookCollection.providerRequestId,
        externalId: webhookCollection.id,
        status: 'SUCCESSFUL',
        financialTransactionId: `QA-WH-${Date.now()}`,
      },
    });
    const webhookUpdated = await prisma.mobileMoneyCollection.findUnique({
      where: { id: webhookCollection.id },
      select: { status: true },
    });
    assert(webhookUpdated?.status === 'CONFIRMED', 'MoMo webhook did not confirm collection.');
    report.momo.webhookConfirm = true;

    const momoSale = await createSale({
      businessId: business.id,
      storeId: mainStore.id,
      tillId: till.id,
      cashierUserId: cashier.id,
      paymentStatus: 'PAID',
      lines: [
        {
          productId: saleLine.productId,
          unitId: saleLine.unitId,
          qtyInUnit: 1,
        },
      ],
      payments: [{ method: 'MOBILE_MONEY', amountPence: collectionA.amountPence }],
      momoCollectionId: collectionA.id,
    });
    const momoPayment = await prisma.salesPayment.findFirst({
      where: { salesInvoiceId: momoSale.id, method: 'MOBILE_MONEY' },
      select: { reference: true, collectionId: true },
    });
    assert(momoPayment?.reference, 'MoMo payment reference is missing for receipt output.');
    assert(momoPayment.collectionId === collectionA.id, 'MoMo collection link missing on payment.');
    report.momo.saleLinkedWithRef = true;

    const failedCollection = await initiateMobileMoneyCollection({
      businessId: business.id,
      storeId: mainStore.id,
      initiatedByUserId: owner.id,
      amountPence: momoExactAmount,
      currency: business.currency,
      payerMsisdn: '0241111000',
      network: 'MTN',
      provider: 'MTN',
      idempotencyKey: `qa-momo-failed-${Date.now()}`,
    });
    await checkMobileMoneyCollectionStatus({
      businessId: business.id,
      collectionId: failedCollection.id,
      force: true,
    });
    let failedBlocked = false;
    try {
      await createSale({
        businessId: business.id,
        storeId: mainStore.id,
        tillId: till.id,
        cashierUserId: cashier.id,
        paymentStatus: 'PAID',
        lines: [
          {
            productId: saleLine.productId,
            unitId: saleLine.unitId,
            qtyInUnit: 1,
          },
        ],
        payments: [{ method: 'MOBILE_MONEY', amountPence: failedCollection.amountPence }],
        momoCollectionId: failedCollection.id,
      });
    } catch {
      failedBlocked = true;
    }
    assert(failedBlocked, 'Failed MoMo collection should not allow paid sale completion.');
    report.momo.failedCollectionBlocked = true;

    // ---------------------------------------------------------------------
    // Cash integrity suite
    // ---------------------------------------------------------------------
    await prisma.business.update({
      where: { id: business.id },
      data: { requireOpenTillForSales: true },
    });
    await closeOpenShiftsForTill(till.id);

    let blockedForClosedTill = false;
    try {
      await createSale({
        businessId: business.id,
        storeId: mainStore.id,
        tillId: till.id,
        cashierUserId: cashier.id,
        paymentStatus: 'PAID',
        lines: [
          {
            productId: saleLine.productId,
            unitId: saleLine.unitId,
            qtyInUnit: 1,
          },
        ],
        payments: [{ method: 'CASH', amountPence: saleLine.approxUnitPrice * 2 }],
      });
    } catch (error) {
      blockedForClosedTill = String((error as Error).message).includes('Open till is required');
    }
    assert(blockedForClosedTill, 'Sale was not blocked when till-open policy is enabled.');
    report.cashIntegrity.blocksSaleWithoutOpenTill = true;

    const openingFloat = 1500;
    const openShift = await prisma.shift.create({
      data: {
        tillId: till.id,
        userId: cashier.id,
        openingCashPence: openingFloat,
        expectedCashPence: openingFloat,
        status: 'OPEN',
      },
      select: { id: true },
    });

    const cashSale = await createSale({
      businessId: business.id,
      storeId: mainStore.id,
      tillId: till.id,
      cashierUserId: cashier.id,
      paymentStatus: 'PAID',
      lines: [
        {
          productId: saleLine.productId,
          unitId: saleLine.unitId,
          qtyInUnit: 1,
        },
      ],
      payments: [{ method: 'CASH', amountPence: saleLine.approxUnitPrice * 2 }],
    });

    const [cashPayment, refreshedShift, cashEntry] = await Promise.all([
      prisma.salesPayment.findFirst({
        where: { salesInvoiceId: cashSale.id, method: 'CASH' },
        select: { amountPence: true },
      }),
      prisma.shift.findUnique({
        where: { id: openShift.id },
        select: { expectedCashPence: true },
      }),
      prisma.cashDrawerEntry.findFirst({
        where: { shiftId: openShift.id, entryType: 'CASH_SALE', referenceId: cashSale.id },
        select: { amountPence: true },
      }),
    ]);
    assert(cashPayment, 'Cash payment was not recorded.');
    assert(cashEntry, 'Cash drawer entry missing for cash sale.');
    assert(
      refreshedShift?.expectedCashPence === openingFloat + cashPayment.amountPence,
      'Shift expected cash did not match opening float + cash sales.'
    );
    report.cashIntegrity.expectedCashMath = true;

    // ---------------------------------------------------------------------
    // Fraud controls suite
    // ---------------------------------------------------------------------
    const riskBefore = await prisma.riskAlert.count({ where: { businessId: business.id } });

    const unpaidForVoid = await createSale({
      businessId: business.id,
      storeId: mainStore.id,
      tillId: till.id,
      cashierUserId: cashier.id,
      customerId: customer.id,
      paymentStatus: 'UNPAID',
      lines: [
        {
          productId: saleLine.productId,
          unitId: saleLine.unitId,
          qtyInUnit: 1,
        },
      ],
      payments: [],
    });

    let voidBlocked = false;
    try {
      await createSalesReturn({
        businessId: business.id,
        salesInvoiceId: unpaidForVoid.id,
        userId: cashier.id,
        type: 'VOID',
      });
    } catch {
      voidBlocked = true;
    }
    assert(voidBlocked, 'Void should require manager approval and reason code.');
    report.fraud.voidRequiresPinAndReason = true;

    await prisma.business.update({
      where: { id: business.id },
      data: {
        discountApprovalThresholdBps: 100,
        inventoryAdjustmentRiskThresholdBase: 1,
      },
    });

    let discountBlocked = false;
    try {
      await createSale({
        businessId: business.id,
        storeId: mainStore.id,
        tillId: till.id,
        cashierUserId: cashier.id,
        paymentStatus: 'PAID',
        orderDiscountType: 'PERCENT',
        orderDiscountValue: 20,
        lines: [
          {
            productId: saleLine.productId,
            unitId: saleLine.unitId,
            qtyInUnit: 1,
          },
        ],
        payments: [{ method: 'CASH', amountPence: saleLine.approxUnitPrice * 2 }],
      });
    } catch {
      discountBlocked = true;
    }
    assert(discountBlocked, 'High discount should require manager approval.');
    report.fraud.highDiscountRequiresApproval = true;

    await createSale({
      businessId: business.id,
      storeId: mainStore.id,
      tillId: till.id,
      cashierUserId: cashier.id,
      paymentStatus: 'PAID',
      orderDiscountType: 'PERCENT',
      orderDiscountValue: 20,
      discountOverrideReasonCode: 'OTHER',
      discountOverrideReason: 'QA discount override check',
      discountApprovedByUserId: owner.id,
      lines: [
        {
          productId: saleLine.productId,
          unitId: saleLine.unitId,
          qtyInUnit: 1,
        },
      ],
      payments: [{ method: 'CASH', amountPence: saleLine.approxUnitPrice * 2 }],
    });

    await createStockAdjustment({
      businessId: business.id,
      storeId: mainStore.id,
      productId: saleLine.productId,
      unitId: saleLine.unitId,
      qtyInUnit: 2,
      direction: 'INCREASE',
      reason: 'QA risk threshold trigger',
      userId: owner.id,
    });

    const riskAfter = await prisma.riskAlert.count({ where: { businessId: business.id } });
    assert(riskAfter > riskBefore, 'Risk alerts did not increment for fraud controls.');
    report.fraud.riskAlertsIncrement = true;

    // ---------------------------------------------------------------------
    // Branch transfer suite
    // ---------------------------------------------------------------------
    const allStores = await prisma.store.findMany({
      where: { businessId: business.id },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    });
    let secondStore = allStores.find((store) => store.id !== mainStore.id) ?? null;
    if (!secondStore) {
      const created = await prisma.store.create({
        data: {
          businessId: business.id,
          name: `Branch ${Date.now().toString().slice(-4)}`,
          address: 'QA Branch',
        },
        select: { id: true, name: true },
      });
      await prisma.till.create({
        data: { storeId: created.id, name: 'Till 1' },
      });
      secondStore = created;
    }

    const org = await ensureOrganizationAndBranches({
      businessId: business.id,
      businessName: business.name,
    });
    assert(org && org.branches.length >= 2, 'Organization branch mapping was not created.');
    report.branchTransfer.organizationMapped = true;

    const sourceBalance = await prisma.inventoryBalance.findUnique({
      where: { storeId_productId: { storeId: mainStore.id, productId: saleLine.productId } },
      select: { qtyOnHandBase: true, avgCostBasePence: true },
    });
    if (!sourceBalance || sourceBalance.qtyOnHandBase < 5) {
      await prisma.inventoryBalance.upsert({
        where: { storeId_productId: { storeId: mainStore.id, productId: saleLine.productId } },
        update: { qtyOnHandBase: 20 },
        create: {
          storeId: mainStore.id,
          productId: saleLine.productId,
          qtyOnHandBase: 20,
          avgCostBasePence: sourceBalance?.avgCostBasePence ?? 100,
        },
      });
    }

    const fromBefore = await prisma.inventoryBalance.findUnique({
      where: { storeId_productId: { storeId: mainStore.id, productId: saleLine.productId } },
      select: { qtyOnHandBase: true },
    });
    const toBefore = await prisma.inventoryBalance.findUnique({
      where: { storeId_productId: { storeId: secondStore.id, productId: saleLine.productId } },
      select: { qtyOnHandBase: true },
    });
    const transferQty = 2;

    const transfer = await requestStockTransfer({
      businessId: business.id,
      requestedByUserId: owner.id,
      fromStoreId: mainStore.id,
      toStoreId: secondStore.id,
      reason: 'QA transfer validation',
      lines: [{ productId: saleLine.productId, qtyBase: transferQty }],
    });
    await approveAndCompleteStockTransfer({
      businessId: business.id,
      transferId: transfer.id,
      approvedByUserId: owner.id,
    });

    const [fromAfter, toAfter, movements] = await Promise.all([
      prisma.inventoryBalance.findUnique({
        where: { storeId_productId: { storeId: mainStore.id, productId: saleLine.productId } },
        select: { qtyOnHandBase: true },
      }),
      prisma.inventoryBalance.findUnique({
        where: { storeId_productId: { storeId: secondStore.id, productId: saleLine.productId } },
        select: { qtyOnHandBase: true },
      }),
      prisma.stockMovement.findMany({
        where: {
          referenceType: 'STOCK_TRANSFER',
          referenceId: transfer.id,
          type: { in: ['TRANSFER_OUT', 'TRANSFER_IN'] },
        },
        select: { type: true, storeId: true, qtyBase: true },
      }),
    ]);

    assert(
      (fromAfter?.qtyOnHandBase ?? 0) === (fromBefore?.qtyOnHandBase ?? 0) - transferQty,
      'Source branch stock did not decrease after transfer.'
    );
    assert(
      (toAfter?.qtyOnHandBase ?? 0) === (toBefore?.qtyOnHandBase ?? 0) + transferQty,
      'Destination branch stock did not increase after transfer.'
    );
    report.branchTransfer.stockMovesBetweenBranches = true;

    const hasOut = movements.some((movement) => movement.type === 'TRANSFER_OUT' && movement.storeId === mainStore.id);
    const hasIn = movements.some((movement) => movement.type === 'TRANSFER_IN' && movement.storeId === secondStore.id);
    assert(hasOut && hasIn, 'Transfer movement logs were not created for both branches.');
    report.branchTransfer.movementLogsCreated = true;

    console.log(JSON.stringify({ success: true, report }, null, 2));
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          success: false,
          report,
          error: error instanceof Error ? error.message : String(error),
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  } finally {
    if (originalBusinessSettings && restoreBusinessId) {
      await prisma.business.update({
        where: { id: restoreBusinessId },
        data: originalBusinessSettings,
      });
    }
    await prisma.$disconnect();
  }
}

run();
