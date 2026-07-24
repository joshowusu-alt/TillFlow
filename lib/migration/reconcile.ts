import type {
  CatalogueRow,
  CatalogueReconciliation,
  MigrationReconciliation,
  MigrationTemplateKind,
  OpeningStockRow,
  OpeningStockReconciliation,
  SupplierRow,
  SupplierReconciliation,
} from '@/lib/migration/types';

export function reconcileCatalogue(rows: CatalogueRow[]): CatalogueReconciliation {
  const cats = new Set(rows.map((r) => r.category.trim().toLowerCase()).filter(Boolean));
  const suppliers = new Set(
    rows.map((r) => r.preferredSupplierLegacyId.trim().toLowerCase()).filter(Boolean),
  );
  return {
    templateKind: 'CATALOGUE',
    rowsValid: rows.length,
    distinctLegacyProductIds: new Set(rows.map((r) => r.legacyProductId.toLowerCase())).size,
    distinctCategories: cats.size,
    distinctPreferredSuppliers: suppliers.size,
    withBarcode: rows.filter((r) => r.primaryBarcode).length,
    withCost: rows.filter((r) => r.costPrice > 0).length,
    activeCount: rows.filter((r) => r.active).length,
    inactiveCount: rows.filter((r) => !r.active).length,
    sumSellingPrice: rows.reduce((a, r) => a + r.sellingPrice, 0),
    sumCostPrice: rows.reduce((a, r) => a + r.costPrice, 0),
  };
}

export function reconcileSuppliers(rows: SupplierRow[]): SupplierReconciliation {
  return {
    templateKind: 'SUPPLIERS',
    rowsValid: rows.length,
    distinctLegacySupplierIds: new Set(rows.map((r) => r.legacySupplierId.toLowerCase())).size,
    withPhone: rows.filter((r) => r.phone).length,
    withEmail: rows.filter((r) => r.email).length,
  };
}

export function reconcileOpeningStock(rows: OpeningStockRow[]): OpeningStockReconciliation {
  let totalQuantity = 0;
  let valuedLines = 0;
  let unvaluedLines = 0;
  let totalStockValue = 0;
  for (const r of rows) {
    totalQuantity += r.quantity;
    if (r.unitCost != null && r.unitCost > 0) {
      valuedLines += 1;
      totalStockValue += r.unitCost * r.quantity;
    } else if (r.quantity > 0) {
      unvaluedLines += 1;
    }
  }
  return {
    templateKind: 'OPENING_STOCK',
    rowsValid: rows.length,
    distinctLegacyProductIds: new Set(rows.map((r) => r.legacyProductId.toLowerCase())).size,
    distinctBranchCodes: new Set(rows.map((r) => r.branchCode.toLowerCase())).size,
    totalQuantity,
    valuedLines,
    unvaluedLines,
    totalStockValue,
  };
}

export function mergeReconciliation(
  kind: MigrationTemplateKind,
  existing: MigrationReconciliation | null,
  chunk: MigrationReconciliation,
): MigrationReconciliation {
  if (!existing) return chunk;
  if (kind === 'CATALOGUE' && existing.templateKind === 'CATALOGUE' && chunk.templateKind === 'CATALOGUE') {
    // Counts from chunks are additive for totals; distinct sets cannot be merged without IDs —
    // callers should recompute from all valid rows when finalising. Additive merge for sums:
    return {
      templateKind: 'CATALOGUE',
      rowsValid: existing.rowsValid + chunk.rowsValid,
      distinctLegacyProductIds: existing.distinctLegacyProductIds + chunk.distinctLegacyProductIds,
      distinctCategories: existing.distinctCategories + chunk.distinctCategories,
      distinctPreferredSuppliers:
        existing.distinctPreferredSuppliers + chunk.distinctPreferredSuppliers,
      withBarcode: existing.withBarcode + chunk.withBarcode,
      withCost: existing.withCost + chunk.withCost,
      activeCount: existing.activeCount + chunk.activeCount,
      inactiveCount: existing.inactiveCount + chunk.inactiveCount,
      sumSellingPrice: existing.sumSellingPrice + chunk.sumSellingPrice,
      sumCostPrice: existing.sumCostPrice + chunk.sumCostPrice,
    };
  }
  if (kind === 'SUPPLIERS' && existing.templateKind === 'SUPPLIERS' && chunk.templateKind === 'SUPPLIERS') {
    return {
      templateKind: 'SUPPLIERS',
      rowsValid: existing.rowsValid + chunk.rowsValid,
      distinctLegacySupplierIds:
        existing.distinctLegacySupplierIds + chunk.distinctLegacySupplierIds,
      withPhone: existing.withPhone + chunk.withPhone,
      withEmail: existing.withEmail + chunk.withEmail,
    };
  }
  if (
    kind === 'OPENING_STOCK' &&
    existing.templateKind === 'OPENING_STOCK' &&
    chunk.templateKind === 'OPENING_STOCK'
  ) {
    return {
      templateKind: 'OPENING_STOCK',
      rowsValid: existing.rowsValid + chunk.rowsValid,
      distinctLegacyProductIds: existing.distinctLegacyProductIds + chunk.distinctLegacyProductIds,
      distinctBranchCodes: existing.distinctBranchCodes + chunk.distinctBranchCodes,
      totalQuantity: existing.totalQuantity + chunk.totalQuantity,
      valuedLines: existing.valuedLines + chunk.valuedLines,
      unvaluedLines: existing.unvaluedLines + chunk.unvaluedLines,
      totalStockValue: existing.totalStockValue + chunk.totalStockValue,
    };
  }
  return chunk;
}

export function reconcileValidRows(
  kind: MigrationTemplateKind,
  rows: Array<CatalogueRow | SupplierRow | OpeningStockRow>,
): MigrationReconciliation {
  switch (kind) {
    case 'CATALOGUE':
      return reconcileCatalogue(rows as CatalogueRow[]);
    case 'SUPPLIERS':
      return reconcileSuppliers(rows as SupplierRow[]);
    case 'OPENING_STOCK':
      return reconcileOpeningStock(rows as OpeningStockRow[]);
  }
}
