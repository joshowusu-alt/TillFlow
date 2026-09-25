import { prisma } from '@/lib/prisma';
import { rankRecognisedProductSales } from '@/lib/reports/product-rank';
import { businessMonthWindow } from '@/lib/reports/reporting-clock';

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export type SupplierSalesProductRow = {
  productId: string;
  productName: string;
  sku: string | null;
  qtyBase: number;
  revenuePence: number;
  salesCount: number;
};

export type SupplierSalesRow = {
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
  },
): Promise<SupplierSalesReport> {
  const { start, end, supplierId } = opts;

  // Step 1: All products with a preferred supplier for this business.
  // Using Product.preferredSupplierId index for fast lookup.
  const linkedProducts = await prisma.product.findMany({
    where: {
      businessId,
      preferredSupplierId: { not: null },
      ...(supplierId ? { preferredSupplierId: supplierId } : {}),
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
      totalQtyBase: 0,
      invoiceIds: new Set(),
      products: new Map(),
    });
  }

  for (const invoice of salesInvoices) {
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
      supplier.totalRevenuePence += rankedLine.amountPence;
      supplier.totalQtyBase += line.qtyBase;
      supplier.invoiceIds.add(invoice.id);
      const existing = supplier.products.get(line.productId);
      if (existing) {
        existing.revenuePence += rankedLine.amountPence;
        existing.qtyBase += line.qtyBase;
        existing.invoiceIds.add(invoice.id);
      } else {
        supplier.products.set(line.productId, {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          revenuePence: rankedLine.amountPence,
          qtyBase: line.qtyBase,
          invoiceIds: new Set([invoice.id]),
        });
      }
    });
  }

  // Step 4: Convert to output shape, sorted revenue desc.
  const rows: SupplierSalesRow[] = [...supplierAcc.values()]
    .map((s) => ({
      supplierId: s.supplierId,
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
          salesCount: p.invoiceIds.size,
        }))
        .sort((a, b) => b.revenuePence - a.revenuePence),
    }))
    .sort((a, b) => b.totalRevenuePence - a.totalRevenuePence);

  const totalRevenuePence = rows.reduce((s, r) => s + r.totalRevenuePence, 0);
  const totalQtyBase = rows.reduce((s, r) => s + r.totalQtyBase, 0);
  const suppliersWithSalesCount = rows.filter((r) => r.totalRevenuePence > 0).length;
  const topSupplierName = rows.find((r) => r.totalRevenuePence > 0)?.supplierName ?? null;

  return { start, end, totalRevenuePence, totalQtyBase, suppliersWithSalesCount, topSupplierName, rows, unallocatedSalesDifferencePence };
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
 * Returns only the top-revenue linked supplier for the current calendar month.
 * Two-query approach — avoids building full per-product breakdowns.
 */
export async function getTopLinkedSupplierForMonth(
  businessId: string,
): Promise<TopLinkedSupplierResult | null> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { timezone: true },
  });
  const month = businessMonthWindow(new Date(), business?.timezone);
  const start = month.startInclusive;
  const endExclusive = month.endExclusive;

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
