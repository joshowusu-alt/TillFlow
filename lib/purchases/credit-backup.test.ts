import { expect, it } from 'vitest';
import { validateCreditBackup } from './credit-backup';
const source = { id: 'source', storeId: 'store', supplierId: 'supplier', returnCreditPence: 4000, creditSettledPence: 2500 };
const target = { id: 'target', storeId: 'store', supplierId: 'supplier', creditAppliedPence: 1000 };
const credits = [{ id: 'credit', purchaseInvoiceId: 'source', creditPence: 4000 }];
const settlements = [{ sourceInvoiceId: 'source', targetInvoiceId: 'target', kind: 'OFFSET', amountPence: 1000, supplierId: 'supplier', storeId: 'store' }, { sourceInvoiceId: 'source', kind: 'REFUND_BANK', amountPence: 1500, supplierId: 'supplier', storeId: 'store' }];
it('restores supporting credit and settlement history together', () => expect(() => validateCreditBackup([source,target], credits, settlements)).not.toThrow());
it('refuses a balance without its supporting credit history', () => expect(() => validateCreditBackup([source,target], [], settlements)).toThrow('balances'));
it('refuses a missing settlement or foreign supplier target', () => {
  expect(() => validateCreditBackup([source,target], credits, [])).toThrow('balances');
  expect(() => validateCreditBackup([source,{...target,supplierId:'foreign'}], credits, settlements)).toThrow('supplier invoices');
});
it('accepts old backups with no credits or settlements', () => expect(() => validateCreditBackup([{id:'old',storeId:'store'}], [], [])).not.toThrow());
