import { prisma } from '@/lib/prisma';
import { rankRecognisedProductSales } from '@/lib/reports/product-rank';
import { evaluateMarginLines } from '@/lib/reports/margin-line';
import { ReportingScopeStoreError, requireAuthorisedStoreIds } from '@/lib/reports/reporting-scope';

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export type SupplierSalesProductRow = {
  netRevenuePence: number;
  costPence: number | null;
  profitPence: number | null;
  marginPercent: number | null;
  productId: string;
  productName: string;
  sku: string | null;
  qtyBase: number;
  revenuePence: number;
  salesCount: number;
};

export type SupplierSalesRow = {
  netRevenuePence: number;
  costPence: number | null;
  profitPence: number | null;
  marginPercent: number | null;
  supplierId: string;
  supplierName: string;
  linkedProductCount: number;
  totalRevenuePence: number;
  totalQtyBase: number;
  totalSalesCount: number;
  avgSaleValuePence: number;
  products: SupplierSalesProductRow[];
};

export type SupplierSalesReport = {
  start: Date;
  end: Date;
  totalRevenuePence: number;
  totalQtyBase: number;
  suppliersWithSalesCount: number;
  topSupplierName: string | null;
  rows: SupplierSalesRow[];
  unallocatedSalesDifferencePence: number;
  unallocatedSalesDifferenceLabel: 'Unallocated sales difference';
  recognisedSalesPence: number;
};

// ---------------------------------------------------------------------------
// Main query
// ---------------------------------------------------------------------------

export async function getSupplierSalesReport(
  businessId: string,
  opts: {
    start: Date;
    end: Date;
    supplierId?: string;
    storeIds?: readonly string[];
    categoryId?: string;
    divisionId?: string;
    groupId?: string;
  },
): Promise<SupplierSalesReport> {
  const { start, end, supplierId, storeIds } = opts;
  const invoiceStore = storeIds && storeIds.length > 0
    ? { storeId: storeIds.length === 1 ? storeIds[0] : { in: [...storeIds] } }
    : {};

  // Step 1: All products with a preferred supplier for this business.
  // Using Product.preferredSupplierId index for fast lookup.
  const linkedProducts = await prisma.product.findMany({
    where: {
      businessId,
      preferredSupplierId: { not: null },
      ...(supplierId ? { preferredSupplierId: supplierId } : {}),
      ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
      ...(opts.divisionId ? { group: { divisionId: opts.divisionId } } : {}),
      ...(opts.groupId ? { groupId: opts.groupId } : {}),
    },
    select: {
      id: true,
      name: true,
      sku: true,
      preferredSupplierId: true,
      preferredSupplier: { select: { id: true, name: true } },
    },
  });

  // Build maps used during aggregation
  const productMap = new Map(linkedProducts.map((p) => [p.id, p]));

  const linkedProductsBySupplier = new Map<string, number>();
  const supplierNames = new Map<string, string>();
  for (const p of linkedProducts) {
    const sid = p.preferredSupplierId!;
    linkedProductsBySupplier.set(sid, (linkedProductsBySupplier.get(sid) ?? 0) + 1);
    if (!supplierNames.has(sid)) {
      supplierNames.set(sid, p.preferredSupplier!.name);
    }
  }

  // Step 2: Sales lines for those products, in the date range, excluding void/returned.
  const salesInvoices =
    linkedProducts.length > 0
      ? await prisma.salesInvoice.findMany({
          where: {
            businessId,
            ...invoiceStore,
            createdAt: { gte: start, lt: end },
            paymentStatus: { notIn: ['RETURNED', 'VOID'] },
            lines: { some: { productId: { in: linkedProducts.map((p) => p.id) } } },
          },
          select: {
            id: true,
            paymentStatus: true,
            discountPence: true,
            vatPence: true,
            totalPence: true,
            lines: {
              select: {
                productId: true,
                qtyBase: true,
                qtyInUnit: true,
                lineCostPence: true,
                costBasis: true,
                lineSubtotalPence: true,
                lineDiscountPence: true,
                promoDiscountPence: true,
                lineVatPence: true,
                lineTotalPence: true,
              },
            },
          },
        })
      : [];

  // Step 3: Aggregate in JS — one pass over sales lines.
  type SupplierAcc = {
    netRevenuePence: number;
    knownCostPence: number;
    incompleteCosts: boolean;
    supplierId: string;
    supplierName: string;
    totalRevenuePence: number;
    totalQtyBase: number;
    invoiceIds: Set<string>;
    products: Map<
      string,
      {
        productId: string;
        name: string;
        sku: string | null;
        revenuePence: number;
        qtyBase: number;
        netRevenuePence: number;
        knownCostPence: number;
        incompleteCosts: boolean;
        invoiceIds: Set<string>;
      }
    >;
  };

  const supplierAcc = new Map<string, SupplierAcc>();
  let unallocatedSalesDifferencePence = 0;

  // Initialise every supplier that has linked products (including zero-sales ones)
  for (const [sid, name] of supplierNames) {
    supplierAcc.set(sid, {
      supplierId: sid,
      supplierName: name,
      totalRevenuePence: 0,
      netRevenuePence: 0, knownCostPence: 0, incompleteCosts: false,
      totalQtyBase: 0,
      invoiceIds: new Set(),
      products: new Map(),
    });
  }

  for (const invoice of salesInvoices) {
    const margins = evaluateMarginLines([{ paymentStatus: invoice.paymentStatus, discountPence: invoice.discountPence, lines: invoice.lines }]);
    const ranked = rankRecognisedProductSales({
      paymentStatus: invoice.paymentStatus,
      discountPence: invoice.discountPence,
      vatPence: invoice.vatPence,
      totalPence: invoice.totalPence,
      lines: invoice.lines.map((line) => ({
        productId: line.productId,
        lineSubtotalPence: line.lineSubtotalPence,
        lineDiscountPence: line.lineDiscountPence,
        promoDiscountPence: line.promoDiscountPence,
        lineVatPence: line.lineVatPence,
        lineTotalPence: line.lineTotalPence,
      })),
    });
    if (!ranked.ok) {
      unallocatedSalesDifferencePence += ranked.differencePence;
      continue;
    }
    ranked.lines.forEach((rankedLine, index) => {
      const line = invoice.lines[index];
      const product = productMap.get(line.productId);
      if (!product?.preferredSupplierId) return;
      const supplier = supplierAcc.get(product.preferredSupplierId);
      if (!supplier) return;
      const margin = margins.lines[index];
      supplier.netRevenuePence += margin.revenuePence;
      supplier.knownCostPence += margin.costPence ?? 0;
      supplier.incompleteCosts ||= !margin.ready;
      supplier.totalRevenuePence += rankedLine.amountPence;
      supplier.totalQtyBase += line.qtyBase;
      supplier.invoiceIds.add(invoice.id);
      const existing = supplier.products.get(line.productId);
      if (existing) {
        existing.revenuePence += rankedLine.amountPence;
        existing.qtyBase += line.qtyBase;
        existing.netRevenuePence += margin.revenuePence;
        existing.knownCostPence += margin.costPence ?? 0;
        existing.incompleteCosts ||= !margin.ready;
        existing.invoiceIds.add(invoice.id);
      } else {
        supplier.products.set(line.productId, {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          revenuePence: rankedLine.amountPence,
          qtyBase: line.qtyBase,
          netRevenuePence: margin.revenuePence, knownCostPence: margin.costPence ?? 0, incompleteCosts: !margin.ready,
          invoiceIds: new Set([invoice.id]),
        });
      }
    });
  }

  // Step 4: Convert to output shape, sorted revenue desc.
  const rows: SupplierSalesRow[] = [...supplierAcc.values()]
    .map((s) => ({
      supplierId: s.supplierId,
      netRevenuePence: s.netRevenuePence,
      costPence: s.incompleteCosts ? null : s.knownCostPence,
      profitPence: s.incompleteCosts ? null : s.netRevenuePence - s.knownCostPence,
      marginPercent: s.incompleteCosts || s.netRevenuePence === 0 ? null : (s.netRevenuePence - s.knownCostPence) / s.netRevenuePence * 100,
      supplierName: s.supplierName,
      linkedProductCount: linkedProductsBySupplier.get(s.supplierId) ?? 0,
      totalRevenuePence: s.totalRevenuePence,
      totalQtyBase: s.totalQtyBase,
      totalSalesCount: s.invoiceIds.size,
      avgSaleValuePence:
        s.invoiceIds.size > 0 ? Math.round(s.totalRevenuePence / s.invoiceIds.size) : 0,
      products: [...s.products.values()]
        .map((p) => ({
          productId: p.productId,
          productName: p.name,
          sku: p.sku,
          qtyBase: p.qtyBase,
          revenuePence: p.revenuePence,
          netRevenuePence: p.netRevenuePence,
          costPence: p.incompleteCosts ? null : p.knownCostPence,
          profitPence: p.incompleteCosts ? null : p.netRevenuePence - p.knownCostPence,
          marginPercent: p.incompleteCosts || p.netRevenuePence === 0 ? null : (p.netRevenuePence - p.knownCostPence) / p.netRevenuePence * 100,
          salesCount: p.invoiceIds.size,
        }))
        .sort((a, b) => b.revenuePence - a.revenuePence),
    }))
    .sort((a, b) => b.totalRevenuePence - a.totalRevenuePence);

  const totalRevenuePence = rows.reduce((s, r) => s + r.totalRevenuePence, 0);
  const recognisedSalesPence = salesInvoices.reduce((sum, invoice) => sum + invoice.totalPence, 0);
  const totalQtyBase = rows.reduce((s, r) => s + r.totalQtyBase, 0);
  const suppliersWithSalesCount = rows.filter((r) => r.totalRevenuePence > 0).length;
  const topSupplierName = rows.find((r) => r.totalRevenuePence > 0)?.supplierName ?? null;

  return {
    start,
    end,
    totalRevenuePence,
    totalQtyBase,
    suppliersWithSalesCount,
    topSupplierName,
    rows,
    unallocatedSalesDifferencePence,
    unallocatedSalesDifferenceLabel: 'Unallocated sales difference',
    recognisedSalesPence,
  };
}

// ---------------------------------------------------------------------------
// Focused dashboard helper — top linked supplier for current month
// ---------------------------------------------------------------------------

export type TopLinkedSupplierResult = {
  supplierId: string;
  supplierName: string;
  totalRevenuePence: number;
  totalQtyBase: number;
};

/**
 * Returns the top-revenue linked supplier inside the authorised half-open window.
 * The caller supplies that window. This function does not recompute a calendar month.
 */
export async function getTopLinkedSupplierForMonth(
  businessId: string,
  storeIds: readonly string[],
  bounds: { startInclusive: Date; endExclusive: Date },
): Promise<TopLinkedSupplierResult | null> {
  const authorisedStores = requireAuthorisedStoreIds(storeIds);
  if (!(bounds.startInclusive < bounds.endExclusive)) {
    throw new ReportingScopeStoreError('Authorised reporting window is required');
  }
  const start = bounds.startInclusive;
  const endExclusive = bounds.endExclusive;

  // Step 1: Products that have a preferred supplier
  const linkedProducts = await prisma.product.findMany({
    where: { businessId, preferredSupplierId: { not: null } },
    select: {
      id: true,
      preferredSupplierId: true,
      preferredSupplier: { select: { id: true, name: true } },
    },
  });

  if (linkedProducts.length === 0) return null;

  // Step 2: MTD sales lines for those products (exclude void/returned)
  const salesLines = await prisma.salesInvoiceLine.findMany({
    where: {
      productId: { in: linkedProducts.map((p) => p.id) },
      salesInvoice: {
        businessId,
        storeId: authorisedStores.length === 1 ? authorisedStores[0] : { in: authorisedStores },
        createdAt: { gte: start, lt: endExclusive },
        paymentStatus: { notIn: ['RETURNED', 'VOID'] },
      },
    },
    select: {
      productId: true,
      qtyBase: true,
      lineSubtotalPence: true,
      lineDiscountPence: true,
      promoDiscountPence: true,
      lineVatPence: true,
      lineTotalPence: true,
      salesInvoice: {
        select: {
          id: true,
          paymentStatus: true,
          discountPence: true,
          vatPence: true,
          totalPence: true,
          lines: {
            select: {
              productId: true,
              lineSubtotalPence: true,
              lineDiscountPence: true,
              promoDiscountPence: true,
              lineVatPence: true,
              lineTotalPence: true,
            },
          },
        },
      },
    },
  });

  if (salesLines.length === 0) return null;

  // Step 3: Aggregate at supplier level only — no per-product breakdown needed
  const productToSupplier = new Map(
    linkedProducts.map((p) => [p.id, { id: p.preferredSupplierId!, name: p.preferredSupplier!.name }]),
  );

  const supplierAcc = new Map<string, { name: string; revenuePence: number; qtyBase: number }>();

  const rankedByInvoice = new Map<string, Map<string, number>>();
  for (const line of salesLines) {
    if (rankedByInvoice.has(line.salesInvoice.id)) continue;
    const ranked = rankRecognisedProductSales(line.salesInvoice);
    const amounts = new Map<string, number>();
    if (ranked.ok) {
      for (const row of ranked.lines) {
        amounts.set(row.productId, (amounts.get(row.productId) ?? 0) + row.amountPence);
      }
    }
    rankedByInvoice.set(line.salesInvoice.id, amounts);
  }

  for (const line of salesLines) {
    const supplier = productToSupplier.get(line.productId);
    if (!supplier) continue;
    const rankedAmount = rankedByInvoice.get(line.salesInvoice.id)?.get(line.productId) ?? 0;
    const acc = supplierAcc.get(supplier.id);
    if (acc) {
      acc.revenuePence += rankedAmount;
      acc.qtyBase += line.qtyBase;
    } else {
      supplierAcc.set(supplier.id, {
        name: supplier.name,
        revenuePence: rankedAmount,
        qtyBase: line.qtyBase,
      });
    }
    rankedByInvoice.get(line.salesInvoice.id)?.set(line.productId, 0);
  }

  // Step 4: Find the supplier with highest MTD revenue
  let topId = '';
  let topRevenue = 0;
  for (const [id, acc] of supplierAcc) {
    if (acc.revenuePence > topRevenue) {
      topRevenue = acc.revenuePence;
      topId = id;
    }
  }

  if (!topId) return null;
  const top = supplierAcc.get(topId)!;

  return {
    supplierId: topId,
    supplierName: top.name,
    totalRevenuePence: top.revenuePence,
    totalQtyBase: top.qtyBase,
  };
}
