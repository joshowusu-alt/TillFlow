'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { err, ok, requireSelectedStoreContext, safeAction, withBusinessContext } from '@/lib/action-utils';
import { prisma } from '@/lib/prisma';
import { isFoodBusiness } from '@/lib/food/business';
import { createPurchase } from '@/lib/services/purchases';
import { INSUFFICIENT_HELD_CASH } from '@/lib/services/purchase-funding';
import { quickCreateProduct } from '@/lib/services/products';
import { listSelectableUnits } from '@/lib/units/list-selectable-units';
import { revalidatePosCatalog } from '@/lib/cache/pos-tags';
import { revalidateOwnerDashboardCache } from '@/lib/reports/cache-revalidation';
import { decodePurchaseDocuments } from '@/lib/purchases/source-documents';
import { purchaseDiscountBps } from '@/lib/purchases/discounts';
import { quickCashShortfallMessage, quickCost, quickMoney, validQuickQuantity, type QuickCashSource, type QuickPayment } from '@/lib/purchases/quick';
import { audit } from '@/lib/audit';
import { readBatchDates } from '@/lib/inventory/batch-dates';

const purchaseRoles = ['OWNER', 'MANAGER'] as const;

export async function setFoodPurchasePhotoRequired(required: boolean) {
  return safeAction(async () => {
    const { businessId } = await withBusinessContext([...purchaseRoles]);
    const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    if (!isFoodBusiness(business.businessCategory) || typeof required !== 'boolean') return err('Setting unavailable.');
    await prisma.business.update({ where: { id: businessId }, data: { requirePurchasePhoto: required } });
    revalidatePath('/settings/purchases');
    revalidatePath('/purchases/quick');
    return ok();
  });
}

export async function createQuickPurchaseProduct(input: { name: string; unitId?: string; ingredient?: boolean; sellingPrice?: string }, requestedStore: string) {
  return safeAction(async () => {
    const { businessId, storeId, user } = await requireSelectedStoreContext([...purchaseRoles], requestedStore);
    const [business, units] = await Promise.all([
      prisma.business.findUniqueOrThrow({ where: { id: businessId } }),
      listSelectableUnits(businessId),
    ]);
    if (!isFoodBusiness(business.businessCategory)) return err('Quick purchase is only available for food businesses.');
    const name = input.name.trim();
    if (!name || name.length > 160) return err('Enter an item name.');
    const unitId = input.unitId ?? units.find(unit => unit.name.toLowerCase() === 'piece')?.id;
    if (!unitId || !units.some(unit => unit.id === unitId)) return err('Choose a unit.');
    const ingredientOnly = input.ingredient !== false;
    const sellingPrice = ingredientOnly ? 0 : quickCost(input.sellingPrice ?? '');
    if (!Number.isSafeInteger(sellingPrice) || (!ingredientOnly && sellingPrice <= 0) || sellingPrice > 2147483647) return err('Add a selling price.');
    const findOrCreateProduct = () => prisma.$transaction(async tx => {
      const [existing] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Product" WHERE "businessId" = ${businessId} AND LOWER(name) = LOWER(${name})
        ORDER BY id LIMIT 1
      `;
      if (existing) {
        const item = await tx.product.findFirst({
          where: { id: existing.id, businessId, active: true, foodDish: { is: null } },
          include: { productUnits: { include: { unit: true } } },
        });
        if (!item) return null;
        return { created: false, id: item.id, name: item.name, vatRateBps: item.vatRateBps,
          units: item.productUnits.map(unit => ({ id: unit.unitId, name: unit.unit.name, pluralName: unit.unit.pluralName, isBaseUnit: unit.isBaseUnit })) };
      }
      const created = await quickCreateProduct(businessId, {
        name, baseUnitId: unitId, sellingPriceBasePence: sellingPrice,
        ingredientOnly, defaultCostBasePence: 0, vatRateBps: 0,
      }, tx);
      await tx.auditLog.create({ data: { businessId, userId: user.id, userName: user.name ?? 'Unknown',
        userRole: user.role, action: 'PRODUCT_CREATE', entity: 'Product', entityId: created.id,
        details: JSON.stringify({ source: 'QUICK_PURCHASE', name, ingredientOnly }) } });
      return { ...created, created: true };
    }, { isolationLevel: 'Serializable' });
    const product = await findOrCreateProduct().catch((error: unknown) => {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034') return findOrCreateProduct();
      throw error;
    });
    if (!product) return err('That name is already used by an unavailable item or dish.');
    revalidatePosCatalog(businessId, storeId);
    revalidatePath('/products');
    return ok(product);
  });
}

export async function changeNewQuickPurchaseItem(input: { id: string; unitId: string; resell: boolean; sellingPrice: string }, requestedStore: string) {
  return safeAction(async () => {
    const { businessId, storeId, user } = await requireSelectedStoreContext([...purchaseRoles], requestedStore);
    const [business, units] = await Promise.all([
      prisma.business.findUniqueOrThrow({ where: { id: businessId } }),
      listSelectableUnits(businessId),
    ]);
    if (!isFoodBusiness(business.businessCategory)) return err('Quick purchase is only available for food businesses.');
    const unit = units.find(option => option.id === input.unitId);
    if (!unit) return err('Choose a unit.');
    const price = input.resell ? quickCost(input.sellingPrice) : 0;
    if (!Number.isSafeInteger(price) || price > 2147483647) return err('Add a selling price.');
    const updated = await prisma.$transaction(async tx => {
      const product = await tx.product.findFirst({
        where: { id: input.id, businessId, active: true, foodDish: { is: null } },
        select: { id: true, name: true, vatRateBps: true, productUnits: { select: { unitId: true, isBaseUnit: true } } },
      });
      const created = await tx.auditLog.findFirst({
        where: { businessId, userId: user.id, entity: 'Product', entityId: input.id, action: 'PRODUCT_CREATE' },
        select: { details: true },
      });
      if (!product || !created?.details?.includes('"source":"QUICK_PURCHASE"') ||
        product.productUnits.length !== 1 || !product.productUnits[0].isBaseUnit) return null;
      if (await tx.stockMovement.count({ where: { productId: product.id } }) ||
        await tx.salesInvoiceLine.count({ where: { productId: product.id } }) ||
        await tx.purchaseInvoiceLine.count({ where: { productId: product.id } })) return null;
      await tx.product.update({ where: { id: product.id }, data: { ingredientOnly: !input.resell, sellingPriceBasePence: price } });
      await tx.productUnit.updateMany({ where: { productId: product.id, isBaseUnit: true }, data: { unitId: unit.id } });
      return { id: product.id, name: product.name, vatRateBps: product.vatRateBps, sellingPriceBasePence: price, units: [{ ...unit, isBaseUnit: true }] };
    }, { isolationLevel: 'Serializable' });
    if (!updated) return err('This item has already been used. Change it from Products.');
    await audit({ businessId, userId: user.id, userName: user.name, userRole: user.role,
      action: 'PRODUCT_UPDATE', entity: 'Product', entityId: input.id, details: { source: 'QUICK_PURCHASE', ...input } });
    revalidatePosCatalog(businessId, storeId);
    revalidatePath('/products');
    return ok(updated);
  });
}

export async function saveQuickPurchase(input: {
  storeId: string; payment: QuickPayment; supplierId: string; dueDate: string; cashSource: QuickCashSource | '';
  supplierInvoiceNumber: string; discount: string; additionalCost: string;
  document: string; tillId: string; key: string;
  rows: { productId: string; unitId: string; quantity: string; cost: string; expiry: string }[];
}) {
  return safeAction(async () => {
    const { businessId, storeId, user } = await requireSelectedStoreContext([...purchaseRoles], input.storeId);
    if (!['Cash', 'MoMo', 'Pay later'].includes(input.payment) || !input.key) return err('Choose how you paid and try again.');
    if (input.payment === 'Pay later' && !input.supplierId) return err("Choose who you're paying later");
    if (!input.rows.length || input.rows.length > 150) return err('Choose between 1 and 150 items.');
    const lines = [];
    for (const row of input.rows) {
      if (!validQuickQuantity(row.quantity)) return err('Enter a whole number for how many you bought.');
      const unitCostPence = quickCost(row.cost);
      if (!Number.isFinite(unitCostPence) || unitCostPence * Number(row.quantity) > 2147483647) {
        const item = await prisma.product.findFirst({ where: { id: row.productId, businessId }, select: { name: true } });
        return err('Add a cost for ' + (item?.name ?? 'this item'));
      }
      const dates = readBatchDates('', row.expiry);
      if (!dates.ok) return err(dates.message);
      lines.push({ productId: row.productId, unitId: row.unitId, qtyInUnit: Number(row.quantity), unitCostPence, expiryDate: dates.dates.expiryDate });
    }
    const additionalCostPence = input.additionalCost ? quickMoney(input.additionalCost) : 0;
    if (!Number.isSafeInteger(additionalCostPence)) return err('Enter a valid delivery or other cost.');
    const parseDate = (value: string) => {
      const parsed = readBatchDates('', value);
      return parsed.ok ? parsed.dates.expiryDate ?? undefined : undefined;
    };
    const dueDate = input.payment === 'Pay later' ? parseDate(input.dueDate) : undefined;
    if (input.payment === 'Pay later' && input.dueDate && !dueDate) return err('Choose a valid date to pay.');
    const paidWith = input.payment === 'Cash' ? 'CASH' : input.payment === 'MoMo' ? 'TRANSFER' : undefined;
    let cashSource: QuickCashSource | undefined;
    let tillId: string | undefined;
    if (paidWith === 'CASH') {
      const openTills = await prisma.till.findMany({
        where: { storeId, store: { businessId }, active: true, shifts: { some: { status: 'OPEN' } } },
        select: { id: true },
      });
      if (openTills.length) {
        tillId = openTills.find(till => till.id === input.tillId)?.id ??
          (openTills.length === 1 ? openTills[0]?.id : undefined);
        if (!tillId) return err('Choose which till you paid from');
      } else {
        if (input.cashSource !== 'OWNER_CAPITAL' && input.cashSource !== 'BUSINESS_CASH') {
          return err('Choose where the cash came from');
        }
        cashSource = input.cashSource;
        if (cashSource === 'OWNER_CAPITAL' && user.role !== 'OWNER') {
          return err('Only the owner can record their own money here. Use the full purchase form for money paid by an owner.');
        }
      }
    }
    const invoice = await createPurchase({
      businessId, storeId, userId: user.id, idempotencyKey: input.key,
      quickPurchase: { paidWith },
      paymentStatus: paidWith ? 'PAID' : 'UNPAID', payments: [],
      supplierId: input.supplierId || undefined, supplierInvoiceNumber: input.supplierInvoiceNumber,
      dueDate, lines, additionalCostPence, discountBps: purchaseDiscountBps(input.discount),
      tillId, cashSource,
      cashHolderId: cashSource === 'BUSINESS_CASH' ? user.id : undefined,
      fundingOwnerId: cashSource === 'OWNER_CAPITAL' ? user.id : undefined,
      sourceDocuments: decodePurchaseDocuments(input.document),
    }).catch((error: unknown) => {
      if (cashSource === 'BUSINESS_CASH' && error instanceof Error && error.message === INSUFFICIENT_HELD_CASH) {
        return null;
      }
      throw error;
    });
    if (!invoice) return err(quickCashShortfallMessage(user.role));
    revalidatePosCatalog(businessId, storeId);
    void audit({ businessId, userId: user.id, userName: user.name, userRole: user.role, action: 'PURCHASE_CREATE', entity: 'PurchaseInvoice', entityId: invoice.id, details: { supplierId: input.supplierId, payment: input.payment, quickPurchase: true } }).catch(error => console.error('[audit]', error));
    revalidateTag('reports');
    revalidateOwnerDashboardCache();
    revalidatePath('/purchases');
    revalidatePath('/purchases/quick');
    const total = Number(invoice.totalPence) + additionalCostPence;
    return ok({ id: invoice.id as string, total, cashSource, tillUsed: Boolean(tillId) && total > 0 });
  });
}
