import { prisma } from '@/lib/prisma';
import { evaluateMarginLines, type MarginInvoiceInput } from '@/lib/reports/margin-line';
import { requireAuthorisedStoreIds } from '@/lib/reports/reporting-scope';

export type ClassificationLevel = 'category' | 'division' | 'group' | 'product';
export type ClassificationCategory = { id: string; name: string; divisions: { id: string; name: string; groups: { id: string; name: string }[] }[] };
export type ClassifiedProduct = { id: string; name: string; categoryId: string | null; groupId: string | null };
export type ClassificationSalesRow = {
  key: string; level: ClassificationLevel; name: string; path: string;
  categoryId: string | null; divisionId: string | null; groupId: string | null; productId: string | null;
  productCount: number; qtySold: number; netSalesPence: number;
  costPence: number | null; profitPence: number | null; marginPercent: number | null;
};
type Sale = MarginInvoiceInput & { salesReturn?: { type: string } | null; lines: (MarginInvoiceInput['lines'][number] & { productId: string })[] };

/** All invoice lines are evaluated before any UI filtering, so order discounts
 * retain their original allocation. Classification uses today's catalogue;
 * costs come exclusively from the historical sale, never today's product cost. */
export function buildClassificationSales(categories: ClassificationCategory[], products: ClassifiedProduct[], sales: Sale[]) {
  type Acc = Omit<ClassificationSalesRow, 'costPence' | 'profitPence' | 'marginPercent'> & { knownCost: number; incomplete: boolean };
  const rows = new Map<string, Acc>();
  const categoryMap = new Map(categories.map(category => [category.id, category]));
  const groups = new Map(categories.flatMap(category => category.divisions.flatMap(division => division.groups.map(group => [group.id, { category, division, group }] as const))));
  const ensure = (level: ClassificationLevel, id: string, name: string, path: string, categoryId: string | null, divisionId: string | null = null, groupId: string | null = null, productId: string | null = null) => {
    const key = `${level}:${id}`;
    if (!rows.has(key)) rows.set(key, { key, level, name, path, categoryId, divisionId, groupId, productId, productCount: 0, qtySold: 0, netSalesPence: 0, knownCost: 0, incomplete: false });
    return rows.get(key)!;
  };
  for (const category of categories) {
    ensure('category', category.id, category.name, category.name, category.id);
    for (const division of category.divisions) {
      const path = `${category.name} / ${division.name}`;
      ensure('division', division.id, division.name, path, category.id, division.id);
      for (const group of division.groups) ensure('group', group.id, group.name, `${path} / ${group.name}`, category.id, division.id, group.id);
    }
  }
  const productRows = new Map<string, Acc[]>();
  for (const product of products) {
    const assignment = product.groupId ? groups.get(product.groupId) : undefined;
    const category = assignment?.category ?? (product.categoryId ? categoryMap.get(product.categoryId) : undefined);
    const categoryId = category?.id ?? null, categoryName = category?.name ?? 'Uncategorised';
    const cat = ensure('category', categoryId ?? 'unassigned', categoryName, categoryName, categoryId);
    const division = assignment
      ? rows.get(`division:${assignment.division.id}`)!
      : ensure('division', `category-only:${categoryId ?? 'unassigned'}`, 'Category only', `${categoryName} / No division`, categoryId);
    const group = assignment
      ? rows.get(`group:${assignment.group.id}`)!
      : ensure('group', `category-only:${categoryId ?? 'unassigned'}`, 'No group assigned', `${categoryName} / No division or group`, categoryId);
    const item = ensure('product', product.id, product.name, `${assignment ? group.path : categoryName} / ${product.name}`, categoryId, assignment?.division.id ?? null, assignment?.group.id ?? null, product.id);
    const chain = [cat, division, group, item];
    chain.forEach(row => row.productCount++);
    productRows.set(product.id, chain);
  }
  for (const sale of sales) {
    if (sale.paymentStatus === 'RETURNED' || sale.paymentStatus === 'VOID') continue;
    const evaluated = evaluateMarginLines([{ ...sale, returnKind: sale.salesReturn ? 'BACKUP_OR_REPLAY' : sale.returnKind }]);
    evaluated.lines.forEach((line, index) => {
      const original = sale.lines[index];
      for (const row of productRows.get(original.productId) ?? []) {
        row.qtySold += original.qtyBase;
        row.netSalesPence += line.revenuePence;
        row.knownCost += line.costPence ?? 0;
        row.incomplete ||= !line.ready;
      }
    });
  }
  return [...rows.values()].map(({ knownCost, incomplete, ...row }): ClassificationSalesRow => ({ ...row,
    costPence: incomplete ? null : knownCost,
    profitPence: incomplete ? null : row.netSalesPence - knownCost,
    marginPercent: incomplete || row.netSalesPence === 0 ? null : (row.netSalesPence - knownCost) / row.netSalesPence * 100,
  })).sort((a, b) => b.netSalesPence - a.netSalesPence || a.path.localeCompare(b.path));
}

export async function getClassificationSalesReport(businessId: string, options: { start: Date; end: Date; storeIds: readonly string[] }) {
  const storeIds = requireAuthorisedStoreIds(options.storeIds);
  const [categories, products, sales] = await prisma.$transaction([
    prisma.category.findMany({ where: { businessId }, select: { id: true, name: true, divisions: {
      where: { businessId }, select: { id: true, name: true, groups: { where: { businessId }, select: { id: true, name: true } } },
    } } }),
    prisma.product.findMany({ where: { businessId }, select: { id: true, name: true, categoryId: true, groupId: true } }),
    prisma.salesInvoice.findMany({ where: { businessId, storeId: { in: storeIds }, createdAt: { gte: options.start, lt: options.end }, paymentStatus: { notIn: ['RETURNED', 'VOID'] } },
      select: { paymentStatus: true, discountPence: true, salesReturn: { select: { type: true } }, lines: { select: { productId: true, qtyBase: true, qtyInUnit: true,
        lineSubtotalPence: true, lineDiscountPence: true, promoDiscountPence: true, lineCostPence: true, costBasis: true } } },
    }),
  ], { isolationLevel: 'Serializable' });
  return { categories, rows: buildClassificationSales(categories, products, sales) };
}
