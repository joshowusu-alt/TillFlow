/**
 * Cross-store till isolation.
 *
 * Every UI that offers a till (cash-in or cash-out) must offer only tills that
 * belong to the authoritative operational store, and every server path that
 * accepts a till must reject one owned by another store before any financial
 * write. The Postgres half of this contract lives in
 * lib/services/expense-payments-concurrency.test.ts.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { getOpenCashShiftForPayment } from '@/lib/services/cash-drawer';
import { resolveStoreFromTill, STORE_MISMATCH_MSG } from '@/lib/reliability/selected-store';

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Every `prisma.shift.findMany({ ... status: 'OPEN' ... till: { ... } })` block in a server page. */
function openShiftSelectorQueries(source: string): string[] {
  const blocks: string[] = [];
  const re = /prisma\.shift\.findMany\(\{/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    let depth = 0;
    let i = match.index + match[0].length - 1;
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    const block = source.slice(match.index, i + 1);
    if (/status:\s*'OPEN'/.test(block) && /till:\s*\{/.test(block)) blocks.push(block);
  }
  return blocks;
}

describe('till selectors are scoped to the authoritative store', () => {
  const pages = walk(join(root, 'app', '(protected)')).filter((file) => /page\.tsx$/.test(file));

  it('every open-shift till selector in a protected page filters tills by storeId', () => {
    const offenders: string[] = [];
    let inspected = 0;
    for (const file of pages) {
      const source = readFileSync(file, 'utf8');
      for (const block of openShiftSelectorQueries(source)) {
        inspected++;
        // Must scope tills to one store, not just to the business.
        if (!/storeId:\s*(store\.id|selectedStoreId|invoice\.storeId|expense\.storeId)/.test(block)) {
          offenders.push(relative(root, file));
        }
      }
    }
    expect(inspected).toBeGreaterThanOrEqual(5);
    expect(offenders).toEqual([]);
  });

  it('expense payments is scoped to the operational store on expenses, tills and focus', () => {
    const page = read('app/(protected)/payments/expense-payments/page.tsx');
    expect(page).toContain('requireBusinessAndOptionalStore');
    expect(page).toContain('SelectOperationalStoreNotice');
    expect(page).toContain('EffectiveStoreBanner');
    expect(page).not.toContain("requireBusiness(['MANAGER', 'OWNER'])");
    // Expenses offered: this store only. Tills offered: this store only.
    expect(page).toMatch(/prisma\.expense\.findMany\(\{\s*where:\s*\{\s*businessId: business\.id,\s*storeId: store\.id/);
    expect(page).toMatch(/till:\s*\{\s*storeId: store\.id,\s*active: true/);
    // The form posts the operational store, never a per-row store from another branch.
    expect(page).not.toContain('storeId={expense.storeId}');
    expect((page.match(/storeId=\{store\.id\}/g) ?? []).length).toBe(2);
    // A focused expense from another branch is named, not paid.
    expect(page).toContain('belongs to ${focusedOtherStore}');
    // Distinct DOM ids for the mobile card and the desktop row (no duplicate ids).
    expect(page).toContain('id={`expense-row-${expense.id}`}');
    expect(page).toContain('id={`expense-card-${expense.id}`}');
    expect(page).not.toContain('id={`expense-${expense.id}`}');
  });

  it('the Expenses list only offers Record payment for expenses in the selected branch', () => {
    const page = read('app/(protected)/expenses/page.tsx');
    expect(page).toContain('store && expense.storeId === store.id');
    expect(page).toContain('Switch to {storeNameById.get(expense.storeId)');
    expect(page).not.toContain('#expense-');
  });

  it('every action that accepts a tillId resolves it against the selected store', () => {
    for (const rel of ['app/actions/expense-payments.ts', 'app/actions/payments.ts']) {
      const source = read(rel);
      expect(source, rel).toContain('resolveStoreFromTill(businessId, tillId, storeId)');
    }
    // Purchases and new expenses pass the till into services that look the shift up
    // under `till.storeId === storeId`, so a foreign till resolves to "no open shift".
    expect(read('lib/services/expenses.ts')).toContain('getOpenCashShiftForPayment');
    expect(read('lib/services/purchases.ts')).toContain('getOpenCashShiftForPayment');
    expect(read('lib/services/payments.ts')).toContain('getOpenCashShiftForPayment');
    expect(read('lib/services/expensePayments.ts')).toContain('getOpenCashShiftForPayment');
  });
});

describe('server-side store/till validation', () => {
  const db = {
    till: {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === 'till-a1' ? { id: 'till-a1', storeId: 'store-a' } : where.id === 'till-b1' ? { id: 'till-b1', storeId: 'store-b' } : null,
      ),
    },
  };

  it('rejects a Store A till while Store B is the selected store, and vice versa', async () => {
    await expect(resolveStoreFromTill('biz', 'till-a1', 'store-b', db as any)).rejects.toThrow(STORE_MISMATCH_MSG);
    await expect(resolveStoreFromTill('biz', 'till-b1', 'store-a', db as any)).rejects.toThrow(STORE_MISMATCH_MSG);
  });

  it('accepts a till that belongs to the selected store', async () => {
    await expect(resolveStoreFromTill('biz', 'till-b1', 'store-b', db as any)).resolves.toEqual({ tillId: 'till-b1', storeId: 'store-b' });
  });

  it('never resolves an open shift on a till outside the payment store', async () => {
    const findFirst = vi.fn(async () => null);
    const result = await getOpenCashShiftForPayment({ shift: { findFirst } }, {
      businessId: 'biz',
      storeId: 'store-b',
      tillId: 'till-a1',
    });
    expect(result).toBeNull();
    const where = (findFirst.mock.calls[0] as any)[0].where;
    expect(where.tillId).toBe('till-a1');
    expect(where.status).toBe('OPEN');
    expect(where.till).toMatchObject({ id: 'till-a1', active: true, storeId: 'store-b', store: { businessId: 'biz' } });
  });
});
