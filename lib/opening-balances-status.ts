/**
 * Opening financial balances — workflow status for Improve Your Records.
 *
 * Core accounts are Cash (1000) and Bank (1010). Saving Cash & Bank always
 * writes both rows. AR/AP/inventory-only rows do not complete the workflow.
 *
 * States:
 * - not_started: no cash/bank opening rows
 * - in_progress: some opening rows exist, but cash+bank core is unfinished
 * - complete: cash and bank opening rows both exist
 * - deferred: reserved for an explicit owner skip (not supported in UI yet)
 */

import { ACCOUNT_CODES } from '@/lib/accounting';

export type OpeningBalancesStatus = 'not_started' | 'in_progress' | 'complete' | 'deferred';

export type OpeningBalanceRowSignal = {
  accountCode: string;
};

export function resolveOpeningBalancesStatus(
  rows: OpeningBalanceRowSignal[],
  options?: { intentionallyDeferred?: boolean }
): OpeningBalancesStatus {
  if (options?.intentionallyDeferred) return 'deferred';

  const codes = new Set(rows.map((r) => r.accountCode));
  const hasCash = codes.has(ACCOUNT_CODES.cash);
  const hasBank = codes.has(ACCOUNT_CODES.bank);

  if (hasCash && hasBank) return 'complete';
  if (codes.size > 0 || hasCash || hasBank) return 'in_progress';
  return 'not_started';
}

export function openingBalancesNeedsAttention(status: OpeningBalancesStatus): boolean {
  return status === 'not_started' || status === 'in_progress';
}
