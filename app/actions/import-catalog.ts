'use server';

import { prisma } from '@/lib/prisma';
import { withBusinessContext, safeAction, ok, err, type ActionResult } from '@/lib/action-utils';

export type ImportCatalogContext = {
  productNames: string[];
  barcodes: string[];
  skus: string[];
  categories: string[];
  suppliers: string[];
};

export async function getImportCatalogContext(): Promise<ActionResult<ImportCatalogContext>> {
  try {
    return await safeAction(async () => {
    const { businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const [products, categories, suppliers] = await Promise.all([
      prisma.product.findMany({
        where: { businessId, active: true },
        select: { name: true, barcode: true, sku: true },
      }),
      prisma.category.findMany({
        where: { businessId },
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.supplier.findMany({
        where: { businessId },
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return ok({
      productNames: products.map((p) => p.name),
      barcodes: products.map((p) => p.barcode).filter((b): b is string => Boolean(b)),
      skus: products.map((p) => p.sku).filter((s): s is string => Boolean(s)),
      categories: categories.map((c) => c.name),
      suppliers: suppliers.map((s) => s.name),
    });
    });
  } catch {
    return err('Could not load your catalogue for import review.');
  }
}

export type ProductImportHistoryItem = {
  id: string;
  fileName: string | null;
  status: string;
  rowsParsed: number;
  rowsImported: number;
  rowsUpdated: number;
  rowsSkipped: number;
  createdAt: string;
  summary: Record<string, unknown> | null;
};

export async function listProductImports(limit = 10): Promise<ActionResult<ProductImportHistoryItem[]>> {
  return safeAction(async () => {
    const { businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
    const rows = await prisma.productImport.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        fileName: true,
        status: true,
        rowsParsed: true,
        rowsImported: true,
        rowsUpdated: true,
        rowsSkipped: true,
        createdAt: true,
        summaryJson: true,
      },
    });
    return ok(
      rows.map((row) => ({
        id: row.id,
        fileName: row.fileName,
        status: row.status,
        rowsParsed: row.rowsParsed,
        rowsImported: row.rowsImported,
        rowsUpdated: row.rowsUpdated,
        rowsSkipped: row.rowsSkipped,
        createdAt: row.createdAt.toISOString(),
        summary: row.summaryJson ? (JSON.parse(row.summaryJson) as Record<string, unknown>) : null,
      }))
    );
  });
}
