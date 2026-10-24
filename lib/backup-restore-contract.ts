/** Core-trading snapshot tables required to recover cash evidence and replay safety. */
export const RECOVERY_TABLES = [
  'cashDrawerEntries', 'moneyIdempotencies', 'businessSequences', 'syncEvents',
  'mobileMoneyCollections', 'mobileMoneyStatusLogs', 'cashVarianceInvestigations',
  'stockTransfers', 'stockTransferLines', 'productBarcodes', 'paymentReconciliations', 'dayClosures', 'openingBalances',
] as const;

/** SQLite writers keep primaries on Product; PostgreSQL mirrors them by trigger. */
export function completeRecoveryBarcodes(businessId: string, products: any[], registry: any[]) {
  const result = registry.map(row => ({ ...row }));
  const owners = new Map<string, string>();
  for (const row of result) {
    if (typeof row.code !== 'string' || owners.has(row.code)) throw new Error('Backup contains an invalid or duplicate barcode.');
    owners.set(row.code, row.productId);
  }
  for (const product of products) {
    if (product.barcode == null) continue;
    const owner = owners.get(product.barcode);
    if (owner != null && owner !== product.id) throw new Error('Backup primary barcode does not match its product registry.');
    if (owner == null) {
      owners.set(product.barcode, product.id);
      result.push({ businessId, productId: product.id, code: product.barcode });
    }
  }
  return result;
}

export function validateRecoverySnapshot(backup: Record<string, any>, businessId: string, ownerId: string) {
  if (backup.business?.id !== businessId) throw new Error('Restore must target the same business as this backup.');
  if (backup.version !== '1.4' || RECOVERY_TABLES.some(key => !Array.isArray(backup[key]))) {
    throw new Error('This backup lacks complete cash and payment recovery evidence. Export a version 1.4 backup before restoring.');
  }
  if (!backup.users?.some((u: any) => u.id === ownerId && u.role === 'OWNER')) {
    throw new Error('The signed-in owner must be present in the backup to retain recovery access.');
  }
  const rows = (key: string): any[] => Array.isArray(backup[key]) ? backup[key] : [];
  completeRecoveryBarcodes(businessId, rows('products'), rows('productBarcodes'));
  for (const key of [...RECOVERY_TABLES, 'stores', 'users', 'customers', 'suppliers', 'categories', 'products', 'accounts', 'salesInvoices', 'purchaseInvoices', 'expenses', 'journalEntries']) {
    for (const row of rows(key)) if (row.businessId != null && row.businessId !== businessId) throw new Error(`Backup ${key} contains another business's record.`);
  }
  const links: Array<[string, string, string, boolean?]> = [
    ['tills','storeId','stores'], ['shifts','tillId','tills'], ['shifts','userId','users'],
    ['inventoryBalances','storeId','stores'], ['inventoryBalances','productId','products'],
    ['productUnits','productId','products'], ['productUnits','unitId','units'],
    ['salesInvoices','storeId','stores'], ['salesInvoices','tillId','tills',true], ['salesInvoices','customerId','customers',true],
    ['salesInvoiceLines','salesInvoiceId','salesInvoices'], ['salesInvoiceLines','productId','products'],
    ['salesPayments','salesInvoiceId','salesInvoices'], ['salesPayments','collectionId','mobileMoneyCollections',true],
    ['purchaseInvoices','storeId','stores'], ['purchaseInvoices','supplierId','suppliers',true],
    ['purchaseInvoiceLines','purchaseInvoiceId','purchaseInvoices'], ['purchaseInvoiceLines','productId','products'],
    ['purchasePayments','purchaseInvoiceId','purchaseInvoices'], ['journalLines','journalEntryId','journalEntries'], ['journalLines','accountId','accounts'],
    ['cashDrawerEntries','storeId','stores'], ['cashDrawerEntries','tillId','tills'], ['cashDrawerEntries','shiftId','shifts',true],
    ['cashDrawerEntries','createdByUserId','users'], ['cashDrawerEntries','cashierUserId','users',true],
    ['mobileMoneyCollections','storeId','stores'], ['mobileMoneyCollections','salesInvoiceId','salesInvoices',true],
    ['mobileMoneyStatusLogs','collectionId','mobileMoneyCollections'], ['cashVarianceInvestigations','shiftId','shifts'],
    ['stockTransfers','fromStoreId','stores'], ['stockTransfers','toStoreId','stores'],
    ['stockTransferLines','stockTransferId','stockTransfers'], ['stockTransferLines','productId','products'], ['productBarcodes','productId','products'],
    ['dayClosures','storeId','stores'], ['paymentReconciliations','storeId','stores'],
  ];
  for (const [table, field, parent, optional] of links) {
    const ids = new Set(rows(parent).map(row => row.id));
    for (const row of rows(table)) {
      if (optional && row[field] == null) continue;
      if (!ids.has(row[field])) throw new Error(`Backup ${table}.${field} references a record outside this snapshot.`);
    }
  }
}
