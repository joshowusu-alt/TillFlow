/** Core-trading snapshot tables required to recover cash evidence and replay safety. */
export const RECOVERY_TABLES = [
  'cashDrawerEntries', 'moneyIdempotencies', 'businessSequences', 'syncEvents',
  'mobileMoneyCollections', 'mobileMoneyStatusLogs', 'cashVarianceInvestigations',
  'stockTransfers', 'stockTransferLines', 'productBarcodes', 'paymentReconciliations', 'dayClosures', 'openingBalances',
] as const;

export function validateRecoverySnapshot(backup: Record<string, any>, businessId: string, ownerId: string) {
  if (backup.business?.id !== businessId) throw new Error('Restore must target the same business as this backup.');
  if (backup.version !== '1.4' || RECOVERY_TABLES.some(key => !Array.isArray(backup[key]))) {
    throw new Error('This backup lacks complete cash and payment recovery evidence. Export a version 1.4 backup before restoring.');
  }
  if (!backup.users?.some((u: any) => u.id === ownerId && u.role === 'OWNER')) {
    throw new Error('The signed-in owner must be present in the backup to retain recovery access.');
  }
  const rows = (key: string): any[] => Array.isArray(backup[key]) ? backup[key] : [];
  const barcodeOwners = new Map<string, string>();
  for (const barcode of rows('productBarcodes')) {
    if (typeof barcode.code !== 'string' || barcodeOwners.has(barcode.code)) throw new Error('Backup contains an invalid or duplicate barcode.');
    barcodeOwners.set(barcode.code, barcode.productId);
  }
  for (const product of rows('products')) {
    if (product.barcode != null && barcodeOwners.get(product.barcode) !== product.id) {
      throw new Error('Backup primary barcode does not match its product registry.');
    }
  }
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
