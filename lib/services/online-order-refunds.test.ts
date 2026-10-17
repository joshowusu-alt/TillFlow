import { beforeEach, expect, it, vi } from 'vitest';
const journal = vi.hoisted(() => vi.fn());
vi.mock('@/lib/accounting', () => ({ ACCOUNT_CODES: { bank: '1010', customerRefundsPayable: '2200' }, postJournalEntry: journal }));
import { recordUnpostedOrderRefundDue } from './online-order-refunds';
const find = vi.fn();
const tx = { journalEntry: { findFirst: find } } as any;
const order = { id: 'o1', businessId: 'b1', totalPence: 1600, salesInvoiceId: null };
beforeEach(() => { vi.clearAllMocks(); find.mockResolvedValue(null); });
it('records actual money received after cancellation as Bank and a refund liability, never sales', async () => {
  await recordUnpostedOrderRefundDue(tx, order);
  expect(journal).toHaveBeenCalledWith(expect.objectContaining({ referenceType: 'ONLINE_ORDER_REFUND_DUE', referenceId: 'o1', lines: [
    { accountCode: '1010', debitPence: 1600 }, { accountCode: '2200', creditPence: 1600 },
  ] }));
});
it('does not duplicate the receipt liability on a repeated provider confirmation', async () => {
  find.mockResolvedValue({ id: 'existing' });
  await recordUnpostedOrderRefundDue(tx, order);
  expect(journal).not.toHaveBeenCalled();
});
it('leaves posted-sale returns to the canonical reversal path', async () => {
  await recordUnpostedOrderRefundDue(tx, { ...order, salesInvoiceId: 'invoice1' });
  expect(journal).not.toHaveBeenCalled();
});
