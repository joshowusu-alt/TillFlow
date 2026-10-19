import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { postJournalEntry, ensureChartOfAccounts } from '@/lib/accounting';
import { isPostgresRuntimeEnv } from '@/lib/database-runtime';
import { getOpenCashShiftForPayment, recordCashDrawerEntryTx } from './cash-drawer';
import { hashCanonicalParts, normalizeMoneyIdempotencyKey } from './money-idempotency';

export type PurchaseCashSource = 'TILL' | 'BUSINESS_CASH' | 'OWNER_LOAN' | 'OWNER_CAPITAL';
export const holdingCode = (storeId: string, userId: string) => `1000.HOLD.${storeId}.${userId}`;
export const ownerCode = (ownerId: string, capital: boolean) => `${capital ? '3100' : '2300'}.OWNER.${ownerId}`;
export function fundingCode(source: PurchaseCashSource, storeId: string, holderId?: string | null, ownerId?: string | null) {
  if (source === 'TILL') return '1000';
  if (source === 'BUSINESS_CASH' && holderId) return holdingCode(storeId, holderId);
  if ((source === 'OWNER_LOAN' || source === 'OWNER_CAPITAL') && ownerId) return ownerCode(ownerId, source === 'OWNER_CAPITAL');
  throw new Error('Choose the person holding business cash or the owner providing funds.');
}
export async function ensureFundingAccount(db: any, businessId: string, storeId: string, source: PurchaseCashSource, holderId?: string | null, ownerId?: string | null) {
  if (!['TILL', 'BUSINESS_CASH', 'OWNER_LOAN', 'OWNER_CAPITAL'].includes(source)) throw new Error('Choose a valid cash source.');
  const code = fundingCode(source, storeId, holderId, ownerId);
  if (source === 'TILL') return code;
  const person = await db.user.findFirst({ where: { id: source === 'BUSINESS_CASH' ? holderId : ownerId, businessId, role: { in: source === 'BUSINESS_CASH' ? ['OWNER', 'MANAGER'] : ['OWNER'] } }, select: { id: true, name: true } });
  if (!person) throw new Error(source === 'BUSINESS_CASH' ? 'Select an owner or manager in this business.' : 'Personal funding must come from an owner of this business.');
  await db.account.upsert({ where: { businessId_code: { businessId, code } }, update: {}, create: { businessId, code, name: source === 'BUSINESS_CASH' ? `Business cash held by ${person.name}` : `${source === 'OWNER_CAPITAL' ? 'Owner contribution' : 'Owed to owner'} — ${person.name}`, type: source === 'BUSINESS_CASH' ? 'ASSET' : source === 'OWNER_CAPITAL' ? 'EQUITY' : 'LIABILITY' } });
  return code;
}
export async function accountBalance(db: any, businessId: string, code: string) {
  const sum = await db.journalLine.aggregate({ where: { account: { businessId, code }, journalEntry: { businessId } }, _sum: { debitPence: true, creditPence: true } });
  return (sum._sum.debitPence ?? 0) - (sum._sum.creditPence ?? 0);
}
export async function lockFundingBalance(db: any, businessId: string, code: string, amountPence: number) {
  // All consumers of these balances take this lock before reading/posting.
  if (isPostgresRuntimeEnv(process.env)) await db.$queryRaw(Prisma.sql`SELECT id FROM "Account" WHERE "businessId" = ${businessId} AND code = ${code} FOR NO KEY UPDATE`);
  if (await accountBalance(db, businessId, code) < amountPence) throw new Error(code === '1010' ? 'Not enough recorded bank / MoMo balance for this transfer.' : 'Not enough recorded business cash with this person. Record the handover first.');
}
export type CashTransferInput = { businessId: string; storeId: string; actorId: string; holderId: string; direction: 'ISSUE' | 'RETURN' | 'REPAY_OWNER'; source: 'TILL' | 'BANK' | 'OWNER_LOAN' | 'OWNER_CAPITAL'; ownerId?: string; tillId?: string; amountPence: number; note: string; key: string };
export async function transferBusinessCash(input: CashTransferInput) {
  if (!Number.isSafeInteger(input.amountPence) || input.amountPence <= 0) throw new Error('Enter a positive cash amount.');
  if (!input.note.trim() || input.note.length > 300) throw new Error('Enter a reason of up to 300 characters.');
  if (!['ISSUE', 'RETURN', 'REPAY_OWNER'].includes(input.direction) || !['TILL', 'BANK', 'OWNER_LOAN', 'OWNER_CAPITAL'].includes(input.source)) throw new Error('Choose a valid transfer.');
  if (input.direction !== 'ISSUE' && !['TILL', 'BANK'].includes(input.source)) throw new Error('Return business cash to a till or bank.');
  const key = normalizeMoneyIdempotencyKey(input.key);
  const hash = hashCanonicalParts(['CASH_TRANSFER', JSON.stringify({ ...input, key })]);
  await ensureChartOfAccounts(input.businessId);
  return prisma.$transaction(async tx => {
    const actor = await tx.user.findFirst({ where: { id: input.actorId, businessId: input.businessId, role: { in: ['OWNER', 'MANAGER'] } } });
    const store = await tx.store.findFirst({ where: { id: input.storeId, businessId: input.businessId } });
    if (!actor || !store) throw new Error('Cash transfer is not authorised.');
    const existing = await tx.moneyIdempotency.findUnique({ where: { businessId_key: { businessId: input.businessId, key } } });
    if (existing) { if (existing.payloadHash !== hash || existing.commandKind !== 'CASH_TRANSFER') throw new Error('This transfer reference was already used for different details.'); return; }
    const held = input.direction === 'REPAY_OWNER' ? await ensureFundingAccount(tx, input.businessId, input.storeId, 'OWNER_LOAN', null, input.ownerId) : await ensureFundingAccount(tx, input.businessId, input.storeId, 'BUSINESS_CASH', input.holderId);
    const external = input.source === 'BANK' ? '1010' : input.source === 'TILL' ? '1000' : await ensureFundingAccount(tx, input.businessId, input.storeId, input.source, null, input.ownerId);
    const amount = input.amountPence;
    if (input.direction === 'RETURN') await lockFundingBalance(tx, input.businessId, held, amount);
    if (input.direction === 'REPAY_OWNER') {
      if (isPostgresRuntimeEnv(process.env)) await tx.$queryRaw(Prisma.sql`SELECT id FROM "Account" WHERE "businessId" = ${input.businessId} AND code = ${held} FOR NO KEY UPDATE`);
      if (-(await accountBalance(tx, input.businessId, held)) < amount) throw new Error('Repayment exceeds the recorded amount owed to this owner.');
    }
    let shift: { id: string; tillId: string } | null = null;
    if (input.source === 'TILL') {
      if (!input.tillId) throw new Error('Select an open till for this transfer.');
      shift = await getOpenCashShiftForPayment(tx, { businessId: input.businessId, storeId: input.storeId, tillId: input.tillId });
      if (!shift) throw new Error('Open this till before transferring its cash.');
      if (input.direction !== 'RETURN') {
        if (isPostgresRuntimeEnv(process.env)) await tx.$queryRaw(Prisma.sql`SELECT id FROM "Shift" WHERE id = ${shift.id} FOR UPDATE`);
        const current = await tx.shift.findFirst({ where: { id: shift.id, status: 'OPEN' }, select: { expectedCashPence: true } });
        if (!current || current.expectedCashPence < amount) throw new Error('Not enough expected cash in this till for the transfer.');
      }
    }
    if (input.source === 'BANK' && input.direction !== 'RETURN') await lockFundingBalance(tx, input.businessId, external, amount);
    // The durable key is reserved inside the same transaction as every posting.
    await tx.moneyIdempotency.create({ data: { businessId: input.businessId, key, commandKind: 'CASH_TRANSFER', payloadHash: hash, resultJson: '{}' } });
    await postJournalEntry({ businessId: input.businessId, description: `Cash ${input.direction === 'ISSUE' ? 'handed over' : input.direction === 'RETURN' ? 'returned' : 'repaid to owner'}: ${input.note}`, referenceType: 'CASH_TRANSFER', referenceId: key, lines: [{ accountCode: input.direction === 'RETURN' ? external : held, debitPence: amount }, { accountCode: input.direction === 'RETURN' ? held : external, creditPence: amount }], prismaClient: tx as any });
    await tx.auditLog.create({ data: { businessId: input.businessId, userId: actor.id, userName: actor.name, userRole: actor.role, action: 'CASH_TRANSFER', entity: 'Account', entityId: held, details: JSON.stringify({ storeId: input.storeId, holderId: input.holderId, ownerId: input.ownerId ?? null, direction: input.direction, source: input.source, amountPence: amount, key }), reason: input.note } });
    if (shift) await recordCashDrawerEntryTx(tx, { businessId: input.businessId, storeId: input.storeId, tillId: shift.tillId, shiftId: shift.id, createdByUserId: input.actorId, entryType: 'CASH_ADJUSTMENT', amountPence: input.direction === 'RETURN' ? amount : -amount, reasonCode: 'BUSINESS_CASH_TRANSFER', reason: input.note, referenceType: 'CASH_TRANSFER', referenceId: key });
  }, { timeout: 15000 });
}
