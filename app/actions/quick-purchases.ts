'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { err, ok, requireSelectedStoreContext, safeAction, withBusinessContext } from '@/lib/action-utils';
import { prisma } from '@/lib/prisma';
import { isFoodBusiness } from '@/lib/food/business';
import { createPurchase } from '@/lib/services/purchases';
import { quickCreateProduct } from '@/lib/services/products';
import { listSelectableUnits } from '@/lib/units/list-selectable-units';
import { revalidatePosCatalog } from '@/lib/cache/pos-tags';
import { revalidateOwnerDashboardCache } from '@/lib/reports/cache-revalidation';
import { decodePurchaseDocuments } from '@/lib/purchases/source-documents';
import { purchaseDiscountBps } from '@/lib/purchases/discounts';
import { quickCost, quickMoney, validQuickQuantity, type QuickCashSource, type QuickPayment } from '@/lib/purchases/quick';
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

export async function createQuickPurchaseProduct(input: { name: string; unitId: string; ingredient: boolean; sellingPrice: string }, requestedStore: string) {
  return safeAction(async () => {
    const { businessId, storeId } = await requireSelectedStoreContext([...purchaseRoles], requestedStore);
    const [business, units] = await Promise.all([
      prisma.business.findUniqueOrThrow({ where: { id: businessId } }),
      listSelectableUnits(businessId),
    ]);
    if (!isFoodBusiness(business.businessCategory)) return err('Quick purchase is only available for food businesses.');
    const name = input.name.trim();
    if (!name || name.length > 160) return err('Enter an item name.');
    if (!units.some(unit => unit.id === input.unitId)) return err('Choose a unit.');
    const sellingPrice = input.ingredient ? 0 : quickCost(input.sellingPrice);
    if (!Number.isSafeInteger(sellingPrice) || (!input.ingredient && sellingPrice <= 0) || sellingPrice > 2147483647) return err('Add a selling price.');
    const product = await quickCreateProduct(businessId, {
      name, baseUnitId: input.unitId, sellingPriceBasePence: sellingPrice,
      ingredientOnly: input.ingredient, defaultCostBasePence: 0, vatRateBps: 0,
    });
    revalidatePosCatalog(businessId, storeId);
    revalidatePath('/products');
    return ok(product);
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
    });
    revalidatePosCatalog(businessId, storeId);
    void audit({ businessId, userId: user.id, userName: user.name, userRole: user.role, action: 'PURCHASE_CREATE', entity: 'PurchaseInvoice', entityId: invoice.id, details: { supplierId: input.supplierId, payment: input.payment, quickPurchase: true } }).catch(error => console.error('[audit]', error));
    revalidateTag('reports');
    revalidateOwnerDashboardCache();
    revalidatePath('/purchases');
    return ok({ id: invoice.id as string, total: Number(invoice.totalPence) + additionalCostPence, cashSource });
  });
}
