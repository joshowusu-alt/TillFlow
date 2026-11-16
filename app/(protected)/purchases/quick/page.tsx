import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireBusinessAndOptionalStore } from '@/lib/auth';
import { isFoodBusiness } from '@/lib/food/business';
import { prisma } from '@/lib/prisma';
import { listSelectableUnits } from '@/lib/units/list-selectable-units';
import { businessCalendarToday, formatCalendarDate } from '@/lib/inventory/batch-dates';
import type { QuickProduct } from '@/lib/purchases/quick';
import QuickPurchaseForm from './QuickPurchaseForm';

export default async function QuickPurchasePage() {
  const { business, store, user, stores } = await requireBusinessAndOptionalStore(['OWNER', 'MANAGER', 'CASHIER']);
  if (!business || !isFoodBusiness(business.businessCategory)) redirect('/purchases');
  const selected = store ?? (stores.length === 1 ? stores[0] : undefined);
  if (!selected) return <p>Choose a store before recording a purchase.</p>;

  const [catalogue, suppliers, units, history, tills] = await Promise.all([
    prisma.product.findMany({
      where: { businessId: business.id, active: true, foodDish: { is: null } },
      select: { id: true, name: true, vatRateBps: true, productUnits: {
        select: { unitId: true, isBaseUnit: true, unit: { select: { name: true, pluralName: true } } },
      } },
      orderBy: { name: 'asc' },
    }),
    prisma.supplier.findMany({ where: { businessId: business.id }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    listSelectableUnits(business.id),
    prisma.purchaseInvoiceLine.findMany({
      where: { purchaseInvoice: { businessId: business.id }, product: { active: true } },
      distinct: ['productId', 'unitId'],
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { productId: true, unitId: true, unitCostPence: true },
    }),
    prisma.till.findMany({
      where: { active: true, storeId: selected.id, shifts: { some: { status: 'OPEN' } } },
      select: { id: true, name: true }, orderBy: { name: 'asc' },
    }),
  ]);
  const historyByItem = new Map<string, { lastUnitId: string; lastCosts: Record<string, number> }>();
  for (const line of history) {
    const entry = historyByItem.get(line.productId) ?? { lastUnitId: line.unitId, lastCosts: {} };
    entry.lastCosts[line.unitId] = line.unitCostPence;
    historyByItem.set(line.productId, entry);
  }
  const products: QuickProduct[] = catalogue.map(product => ({
    id: product.id, name: product.name, vatRateBps: product.vatRateBps,
    units: product.productUnits.map(unit => ({ id: unit.unitId, isBaseUnit: unit.isBaseUnit, ...unit.unit })),
    ...historyByItem.get(product.id),
  }));

  return <main className="mx-auto max-w-xl pb-40">
    <QuickPurchaseForm storeId={selected.id} products={products} suppliers={suppliers} units={units} tills={tills}
      vatEnabled={business.vatEnabled} photoRequired={business.requirePurchasePhoto} canManage={user.role !== 'CASHIER'}
      today={formatCalendarDate(businessCalendarToday(new Date(), business.timezone))} />
    {user.role !== 'CASHIER' && <Link className="mt-6 inline-block text-sm underline" href={'/purchases?full=1&storeId=' + encodeURIComponent(selected.id) + '#record-purchase-form'}>Use full purchase form</Link>}
  </main>;
}
