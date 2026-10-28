import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { UserError } from '@/lib/action-utils';
import { payableDocumentBalance } from '@/lib/reports/payables-balance';
import { lockPurchaseInvoiceForUpdate, assertMoneyMovementTenantChain } from './money-idempotency';
import { getOpenCashShiftForPayment, recordCashDrawerEntryTx } from './cash-drawer';
import { ACCOUNT_CODES, postJournalEntry } from '@/lib/accounting';
import type { PrismaClient } from '@prisma/client';

export type SupplierCreditSettlementInput = {
  businessId: string; storeId: string; userId: string; sourceInvoiceId: string;
  targetInvoiceId?: string; kind: 'OFFSET' | 'REFUND_BANK' | 'REFUND_CASH';
  amountPence: number; reference: string; requestKey: string; tillId?: string;
};

/** Explicit settlement: an offset moves no money; a refund records money actually received. */
export async function settleSupplierCredit(input: SupplierCreditSettlementInput) {
  if (process.env.VERCEL_ENV === 'production') throw new UserError('Supplier credit settlement is awaiting preview verification.');
  if (!await prisma.business.findFirst({ where: { id: input.businessId, isDemo: true }, select: { id: true } })) throw new UserError('This preview pilot is limited to demo businesses.');
  if (!['OFFSET', 'REFUND_BANK', 'REFUND_CASH'].includes(input.kind) || !Number.isSafeInteger(input.amountPence) || input.amountPence <= 0) throw new UserError('Enter a positive settlement amount.');
  if (!input.reference.trim() || input.reference.length > 500 || !input.requestKey || input.requestKey.length > 120) throw new UserError('A settlement reference and request key are required.');
  if (input.kind === 'OFFSET' && (!input.targetInvoiceId || input.targetInvoiceId === input.sourceInvoiceId)) throw new UserError('Choose another invoice for this supplier.');
  if (input.kind !== 'OFFSET' && input.targetInvoiceId) throw new UserError('A refund cannot also be applied to an invoice.');
  const payloadHash = createHash('sha256').update(JSON.stringify({ ...input, reference: input.reference.trim() })).digest('hex');
  return prisma.$transaction(async tx => {
    // Stable lock order serialises offsets, refunds, returns and supplier payments.
    for (const id of [...new Set([input.sourceInvoiceId, ...(input.targetInvoiceId ? [input.targetInvoiceId] : [])])].sort()) {
      await lockPurchaseInvoiceForUpdate(tx as unknown as Parameters<typeof lockPurchaseInvoiceForUpdate>[0], input.businessId, id);
    }
    const actor = await tx.user.findFirst({ where: { id: input.userId, businessId: input.businessId, active: true, role: { in: ['OWNER', 'MANAGER'] } } });
    if (!actor) throw new UserError('An active owner or manager must record the settlement.');
    const replay = await tx.supplierCreditSettlement.findUnique({ where: { requestKey: input.requestKey } });
    if (replay) {
      if (replay.businessId !== input.businessId || replay.payloadHash !== payloadHash) throw new UserError('This settlement request was already used with different details.');
      return replay;
    }
    const source = await tx.purchaseInvoice.findFirst({ where: { id: input.sourceInvoiceId, businessId: input.businessId, storeId: input.storeId }, include: { payments: true } });
    if (!source?.supplierId || source.returnCreditPence <= 0 || ['VOID', 'RETURNED'].includes(source.paymentStatus)) throw new UserError('Choose an active purchase with a return credit.');
    if (!await tx.supplier.findFirst({ where: { id: source.supplierId, businessId: input.businessId }, select: { id: true } })) throw new UserError('The supplier does not belong to this business.');
    const available = Math.max(0, -payableDocumentBalance(source).balancePence);
    if (input.amountPence > available) throw new UserError('Settlement exceeds the unused credit on this invoice.');
    const target = input.targetInvoiceId ? await tx.purchaseInvoice.findFirst({ where: { id: input.targetInvoiceId, businessId: input.businessId, storeId: input.storeId, supplierId: source.supplierId }, include: { payments: true } }) : null;
    if (input.kind === 'OFFSET' && (!target || ['VOID', 'RETURNED'].includes(target.paymentStatus) || payableDocumentBalance(target).balancePence < input.amountPence)) throw new UserError('The selected invoice must have enough outstanding debt for the same supplier and branch.');
    let shift: { id: string; tillId: string } | null = null;
    if (input.kind === 'REFUND_CASH') {
      if (!input.tillId) throw new UserError('Choose the open till that received the supplier refund.');
      shift = await getOpenCashShiftForPayment(tx, { businessId: input.businessId, storeId: input.storeId, tillId: input.tillId });
      if (!shift) throw new UserError('Open the selected till before recording a cash refund.');
      await assertMoneyMovementTenantChain(tx, { businessId: input.businessId, storeId: input.storeId, userId: input.userId, tillId: shift.tillId, shiftId: shift.id });
    }
    const settlement = await tx.supplierCreditSettlement.create({ data: { businessId: input.businessId, storeId: input.storeId, supplierId: source.supplierId, sourceInvoiceId: source.id, targetInvoiceId: target?.id ?? null, userId: actor.id, kind: input.kind, amountPence: input.amountPence, reference: input.reference.trim(), requestKey: input.requestKey, payloadHash } });
    await tx.purchaseInvoice.update({ where: { id: source.id }, data: { creditSettledPence: { increment: input.amountPence } } });
    if (target) {
      const remaining = payableDocumentBalance(target).balancePence - input.amountPence;
      await tx.purchaseInvoice.update({ where: { id: target.id }, data: { creditAppliedPence: { increment: input.amountPence }, paymentStatus: remaining === 0 ? 'PAID' : 'PART_PAID' } });
    }
    // Offsets only reallocate the AP subledger; no cash, inventory, VAT or GL balance changes.
    if (input.kind !== 'OFFSET') await postJournalEntry({ businessId: input.businessId, referenceType: 'SUPPLIER_CREDIT_REFUND', referenceId: settlement.id, description: `Supplier refund received: ${settlement.reference}`, lines: [{ accountCode: input.kind === 'REFUND_CASH' ? ACCOUNT_CODES.cash : ACCOUNT_CODES.bank, debitPence: input.amountPence }, { accountCode: ACCOUNT_CODES.ap, creditPence: input.amountPence }], prismaClient: tx as unknown as PrismaClient });
    if (shift) await recordCashDrawerEntryTx(tx, { businessId: input.businessId, storeId: input.storeId, tillId: shift.tillId, shiftId: shift.id, createdByUserId: actor.id, cashierUserId: actor.id, entryType: 'SUPPLIER_REFUND_RECEIVED', amountPence: input.amountPence, reasonCode: 'SUPPLIER_CREDIT_REFUND', reason: input.reference.trim(), referenceType: 'SUPPLIER_CREDIT_SETTLEMENT', referenceId: settlement.id });
    await tx.auditLog.create({ data: { businessId: input.businessId, userId: actor.id, userName: actor.name, userRole: actor.role, action: 'SUPPLIER_CREDIT_SETTLEMENT', entity: 'SupplierCreditSettlement', entityId: settlement.id, reason: input.reference.trim(), details: JSON.stringify({ sourceInvoiceId: source.id, targetInvoiceId: target?.id, amountPence: input.amountPence, kind: input.kind, cashReceivedPence: input.kind === 'OFFSET' ? 0 : input.amountPence }) } });
    return settlement;
  }, { maxWait: 10000, timeout: 30000 });
}
