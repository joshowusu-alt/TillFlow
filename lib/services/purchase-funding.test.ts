import { beforeEach, describe, expect, it, vi } from 'vitest';
const { db, post, balances, owners, accounts } = vi.hoisted(() => ({ db: {} as any, post: vi.fn(), balances: new Map<string, number>(), owners: new Map<string, string>(), accounts: new Map<string, any>() }));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/lib/accounting', () => ({ ensureChartOfAccounts: vi.fn(), postJournalEntry: post }));
vi.mock('./cash-drawer', () => ({ getOpenCashShiftForPayment: vi.fn().mockResolvedValue({ id: 'shift', tillId: 'till' }), recordCashDrawerEntryTx: vi.fn() }));
import { accountBalance, ensureFundingAccount, holdingCode, ownerCode, transferBusinessCash } from './purchase-funding';
import { recordCashDrawerEntryTx } from './cash-drawer';
const input = { businessId: 'biz', storeId: 'store', actorId: 'manager', holderId: 'manager', direction: 'ISSUE' as const, source: 'BANK' as const, amountPence: 100000, note: 'Supplier advance', key: 'cash-test-key' };
beforeEach(() => {
  vi.clearAllMocks(); balances.clear(); accounts.clear(); owners.clear(); owners.set('owner', 'OWNER'); owners.set('manager', 'MANAGER');
  db.user = { findFirst: vi.fn(async ({ where }: any) => owners.has(where.id) && where.businessId === 'biz' && where.role.in.includes(owners.get(where.id)) ? { id: where.id, name: where.id, role: owners.get(where.id) } : null) };
  db.auditLog = { create: vi.fn() };
  db.store = { findFirst: vi.fn().mockResolvedValue({ id: 'store' }) };
  db.account = { upsert: vi.fn(async ({ create }: any) => { accounts.set(create.code, create); return create; }) };
  db.journalLine = { aggregate: vi.fn(async ({ where }: any) => ({ _sum: { debitPence: balances.get(where.account.code) ?? 0, creditPence: 0 } })) };
  const keys = new Map();
  db.moneyIdempotency = { findUnique: vi.fn(async ({ where }: any) => keys.get(where.businessId_key.key)), create: vi.fn(async ({ data }: any) => { keys.set(data.key, data); return data; }) };
  db.$transaction = vi.fn(async (callback: any) => callback(db));
  post.mockImplementation(async ({ lines }: any) => { for (const line of lines) balances.set(line.accountCode, (balances.get(line.accountCode) ?? 0) + (line.debitPence ?? 0) - (line.creditPence ?? 0)); });
  balances.set('1010', 200000);
});
describe('purchase funding controls', () => {
  it('tracks 1,000 given, 800 spent and 200 returned without income or another expense', async () => {
    await transferBusinessCash(input);
    const held = holdingCode('store', 'manager');
    expect(await accountBalance(db, 'biz', held)).toBe(100000);
    await post({ lines: [{ accountCode: held, creditPence: 80000 }, { accountCode: '1200', debitPence: 80000 }] });
    await transferBusinessCash({ ...input, direction: 'RETURN', amountPence: 20000, key: 'return-key' });
    expect(await accountBalance(db, 'biz', held)).toBe(0);
    expect(recordCashDrawerEntryTx).not.toHaveBeenCalled();
    expect(post.mock.calls.flatMap(([args]) => args.lines).every((line: any) => !['4000', '6000'].includes(line.accountCode))).toBe(true);
  });
  it('rejects personal funding from a manager and a foreign owner', async () => {
    await expect(ensureFundingAccount(db, 'biz', 'store', 'OWNER_LOAN', null, 'manager')).rejects.toThrow('must come from an owner');
    await expect(ensureFundingAccount(db, 'other', 'store', 'OWNER_CAPITAL', null, 'owner')).rejects.toThrow('must come from an owner');
    expect(db.account.upsert).not.toHaveBeenCalled();
  });
  it('records owner funds as a liability or contribution, never income', async () => {
    await transferBusinessCash({ ...input, source: 'OWNER_LOAN', ownerId: 'owner' });
    expect(balances.get(ownerCode('owner', false))).toBe(-100000);
    expect(accounts.get(ownerCode('owner', false)).type).toBe('LIABILITY');
    await transferBusinessCash({ ...input, source: 'OWNER_CAPITAL', ownerId: 'owner', key: 'capital-key' });
    expect(accounts.get(ownerCode('owner', true)).type).toBe('EQUITY');
  });
  it('blocks returning more than the recorded cash', async () => {
    await expect(transferBusinessCash({ ...input, direction: 'RETURN' })).rejects.toThrow('Not enough recorded');
    expect(post).not.toHaveBeenCalled();
  });
  it('replays a transfer once and rejects changed amounts using the same reference', async () => {
    await transferBusinessCash(input); await transferBusinessCash(input);
    expect(post).toHaveBeenCalledTimes(1);
    await expect(transferBusinessCash({ ...input, amountPence: 999 })).rejects.toThrow('already used');
  });
  it('repays only the recorded owner liability without creating an expense', async () => {
    balances.set(ownerCode('owner', false), -80000);
    await transferBusinessCash({ ...input, direction: 'REPAY_OWNER', ownerId: 'owner', amountPence: 80000 });
    expect(balances.get(ownerCode('owner', false))).toBe(0);
    expect(balances.get('1010')).toBe(120000);
    await expect(transferBusinessCash({ ...input, direction: 'REPAY_OWNER', ownerId: 'owner', amountPence: 1, key: 'extra-repayment' })).rejects.toThrow('exceeds');
  });
  it('refuses a bank handover above the recorded bank balance', async () => {
    await expect(transferBusinessCash({ ...input, amountPence: 200001 })).rejects.toThrow('Not enough recorded');
  });
});
