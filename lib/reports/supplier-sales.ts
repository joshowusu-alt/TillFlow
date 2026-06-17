import { prisma } from '@/lib/prisma';

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
  const salesLines =
    linkedProducts.length > 0
      ? await prisma.salesInvoiceLine.findMany({
          where: {
            productId: { in: linkedProducts.map((p) => p.id) },
            salesInvoice: {
              businessId,
              createdAt: { gte: start, lte: end },
              paymentStatus: { notIn: ['RETURNED', 'VOID'] },
            },
          },
          select: {
            productId: true,
            salesInvoiceId: true,
            qtyBase: true,
            lineTotalPence: true,
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

  for (const line of salesLines) {
    const product = productMap.get(line.productId);
    if (!product) continue;
    const sid = product.preferredSupplierId!;
    const supplier = supplierAcc.get(sid);
    if (!supplier) continue;

    supplier.totalRevenuePence += line.lineTotalPence;
    supplier.totalQtyBase += line.qtyBase;
    supplier.invoiceIds.add(line.salesInvoiceId);

    const existing = supplier.products.get(line.productId);
    if (existing) {
      existing.revenuePence += line.lineTotalPence;
      existing.qtyBase += line.qtyBase;
      existing.invoiceIds.add(line.salesInvoiceId);
    } else {
      supplier.products.set(line.productId, {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        revenuePence: line.lineTotalPence,
        qtyBase: line.qtyBase,
        invoiceIds: new Set([line.salesInvoiceId]),
      });
    }
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

  return { start, end, totalRevenuePence, totalQtyBase, suppliersWithSalesCount, topSupplierName, rows };
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
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

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
        createdAt: { gte: start, lte: end },
        paymentStatus: { notIn: ['RETURNED', 'VOID'] },
      },
    },
    select: { productId: true, qtyBase: true, lineTotalPence: true },
  });

  if (salesLines.length === 0) return null;

  // Step 3: Aggregate at supplier level only — no per-product breakdown needed
  const productToSupplier = new Map(
    linkedProducts.map((p) => [p.id, { id: p.preferredSupplierId!, name: p.preferredSupplier!.name }]),
  );

  const supplierAcc = new Map<string, { name: string; revenuePence: number; qtyBase: number }>();

  for (const line of salesLines) {
    const supplier = productToSupplier.get(line.productId);
    if (!supplier) continue;
    const acc = supplierAcc.get(supplier.id);
    if (acc) {
      acc.revenuePence += line.lineTotalPence;
      acc.qtyBase += line.qtyBase;
    } else {
      supplierAcc.set(supplier.id, {
        name: supplier.name,
        revenuePence: line.lineTotalPence,
        qtyBase: line.qtyBase,
      });
    }
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
