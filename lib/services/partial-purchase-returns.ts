import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { UserError } from '@/lib/action-utils';
import type { PrismaClient } from '@prisma/client';
import { allocatedReturnValue } from '@/lib/purchases/partial-return';
import { lockPurchaseInvoiceForUpdate } from './money-idempotency';
import { lockInventoryValues, fetchInventoryMap, upsertInventoryBalance } from './shared/inventory-utils';
import { INVENTORY_VALUE_V1, removeRecordedStockValue } from '@/lib/inventory-value';
import { ACCOUNT_CODES, postJournalEntry } from '@/lib/accounting';

export type PurchaseCreditLine = { lineId: string; productId: string; qtyBase: number; netPence: number; vatPence: number; totalPence: number };
export type PartialPurchaseReturnInput = {
  businessId: string; storeId: string; invoiceId: string; userId: string;
  requestKey: string; reason: string; kind: 'RETURN' | 'SHORT_DELIVERY_CREDIT';
  lines: { lineId: string; qtyBase: number }[];
};

/** Preview pilot: no automatic cash refund, no invoice/line/payment history rewriting. */
export async function createPartialPurchaseReturn(input: PartialPurchaseReturnInput) {
  if (process.env.VERCEL_ENV === 'production') throw new UserError('Partial purchase returns are awaiting preview verification.');
  if (!await prisma.business.findFirst({ where: { id: input.businessId, isDemo: true }, select: { id: true } })) throw new UserError('This preview pilot is limited to demo businesses.');
  if (!input.requestKey || input.requestKey.length > 120 || !input.reason.trim() || input.reason.length > 500) throw new UserError('A request key and return reason are required.');
  if (!['RETURN', 'SHORT_DELIVERY_CREDIT'].includes(input.kind) || !input.lines.length || input.lines.length > 200) throw new UserError('Choose the return type and at least one line.');
  if (new Set(input.lines.map(line => line.lineId)).size !== input.lines.length) throw new UserError('Duplicate source lines are not allowed.');
  for (const line of input.lines) if (!Number.isSafeInteger(line.qtyBase) || line.qtyBase <= 0) throw new UserError('Return quantities must be positive whole base units.');
  const hash = createHash('sha256').update(JSON.stringify({ businessId: input.businessId, storeId: input.storeId, invoiceId: input.invoiceId, userId: input.userId, reason: input.reason.trim(), kind: input.kind, lines: [...input.lines].sort((a,b) => a.lineId.localeCompare(b.lineId)) })).digest('hex');
  return prisma.$transaction(async tx => {
    await lockPurchaseInvoiceForUpdate(tx as unknown as Parameters<typeof lockPurchaseInvoiceForUpdate>[0], input.businessId, input.invoiceId);
    const invoice = await tx.purchaseInvoice.findFirst({ where: { id: input.invoiceId, businessId: input.businessId, storeId: input.storeId }, include: { lines: true, payments: true, purchaseReturn: true, returnCredits: true } });
    if (!invoice) throw new UserError('Purchase not found in the selected branch.');
    const actor = await tx.user.findFirst({ where: { id: input.userId, businessId: input.businessId, active: true, role: { in: ['OWNER', 'MANAGER'] } }, select: { id: true, name: true, role: true } });
    if (!actor) throw new UserError('An active owner or manager must record the return.');
    const previousRequest = await tx.purchaseReturnCredit.findUnique({ where: { requestKey: input.requestKey } });
    if (previousRequest) {
      if (previousRequest.businessId !== input.businessId || previousRequest.payloadHash !== hash) throw new UserError('This request key was already used for another return.');
      return previousRequest;
    }
    if (!invoice.supplierId) throw new UserError('Link the supplier before creating a supplier credit.');
    if (!await tx.supplier.findFirst({ where: { id: invoice.supplierId, businessId: input.businessId }, select: { id: true } })) throw new UserError('The supplier does not belong to this business.');
    if (invoice.purchaseReturn || ['RETURNED','VOID'].includes(invoice.paymentStatus)) throw new UserError('This purchase was already fully reversed.');
    if (invoice.lines.some(line => (line.allocatedCostPence ?? 0) !== 0)) throw new UserError('Returns with capitalised delivery costs require a cost allocation review and are not enabled in this preview pilot.');
    const prior = invoice.returnCredits.flatMap(credit => JSON.parse(credit.linesJson) as PurchaseCreditLine[]);
    const lines: PurchaseCreditLine[] = input.lines.map(request => {
      const source = invoice.lines.find(line => line.id === request.lineId);
      if (!source) throw new UserError('Return line does not belong to this purchase.');
      const already = prior.filter(line => line.lineId === source.id).reduce((sum, line) => sum + line.qtyBase, 0);
      if (already + request.qtyBase > source.qtyBase) throw new UserError('Return exceeds remaining source quantity.');
      const netPence = allocatedReturnValue(source.lineSubtotalPence, source.qtyBase, already, request.qtyBase);
      const vatPence = allocatedReturnValue(source.lineVatPence, source.qtyBase, already, request.qtyBase);
      return { lineId: source.id, productId: source.productId, qtyBase: request.qtyBase, netPence, vatPence, totalPence: netPence + vatPence };
    });
    const creditPence = lines.reduce((sum, line) => sum + line.totalPence, 0);
    if (invoice.returnCreditPence + creditPence > invoice.totalPence) throw new UserError('Credit exceeds the remaining invoice value.');
    const products = [...new Set(lines.map(line => line.productId))].sort();
    await lockInventoryValues(tx, invoice.storeId, products);
    const stock = await fetchInventoryMap(invoice.storeId, products, tx);
    for (const productId of products) {
      const selected = lines.filter(line => line.productId === productId);
      const qty = selected.reduce((sum, line) => sum + line.qtyBase, 0);
      const net = selected.reduce((sum, line) => sum + line.netPence, 0);
      const before = stock.get(productId);
      if (!before || before.qtyOnHandBase < qty) throw new UserError('Return exceeds current branch stock.');
      const after = removeRecordedStockValue(before, qty, net);
      await upsertInventoryBalance(tx, invoice.storeId, productId, after.qtyOnHandBase, after.avgCostBasePence, after);
    }
    const credit = await tx.purchaseReturnCredit.create({ data: { purchaseInvoiceId: invoice.id, businessId: input.businessId, storeId: invoice.storeId, userId: actor.id, requestKey: input.requestKey, payloadHash: hash, creditPence, reason: input.reason.trim(), kind: input.kind, linesJson: JSON.stringify(lines) } });
    await tx.stockMovement.createMany({ data: lines.map(line => ({ storeId: invoice.storeId, productId: line.productId, qtyBase: -line.qtyBase, valuePence: -line.netPence, costBasis: INVENTORY_VALUE_V1, type: 'PURCHASE_RETURN', referenceType: 'PURCHASE_RETURN_CREDIT', referenceId: credit.id, userId: actor.id })) });
    const totalCredit = invoice.returnCreditPence + creditPence;
    const netCharge = invoice.totalPence - totalCredit + invoice.creditSettledPence;
    const paid = invoice.payments.reduce((sum, payment) => sum + payment.amountPence, 0) + invoice.creditAppliedPence;
    // Preserve PAID for a creditor position; the signed supplier balance exposes the credit.
    const status = paid >= netCharge ? 'PAID' : paid > 0 ? 'PART_PAID' : 'UNPAID';
    await tx.purchaseInvoice.update({ where: { id: invoice.id }, data: { returnCreditPence: totalCredit, paymentStatus: status } });
    const net = lines.reduce((sum, line) => sum + line.netPence, 0), vat = lines.reduce((sum, line) => sum + line.vatPence, 0);
    if (creditPence > 0) await postJournalEntry({ businessId: input.businessId, description: `Partial purchase return ${credit.id}`, referenceType: 'PURCHASE_RETURN_CREDIT', referenceId: credit.id, lines: [{ accountCode: ACCOUNT_CODES.ap, debitPence: creditPence }, ...(net ? [{ accountCode: ACCOUNT_CODES.inventory, creditPence: net }] : []), ...(vat ? [{ accountCode: ACCOUNT_CODES.vatReceivable, creditPence: vat }] : [])], prismaClient: tx as unknown as PrismaClient });
    await tx.auditLog.create({ data: { businessId: input.businessId, userId: actor.id, userName: actor.name, userRole: actor.role, action: 'PARTIAL_PURCHASE_RETURN', entity: 'PurchaseInvoice', entityId: invoice.id, reason: input.reason.trim(), details: JSON.stringify({ creditId: credit.id, lines, originalInvoiceTotalPence: invoice.totalPence, cumulativeCreditPence: totalCredit, cashReceivedPence: 0 }) } });
    return credit;
  }, { maxWait: 10000, timeout: 30000 });
}
