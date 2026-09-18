import { INVENTORY_LOSS_ACCOUNT_CODE } from '@/lib/reliability/walkthrough-contracts';
import { isPrismaUniqueConstraintOn } from './money-idempotency';

export const INVENTORY_LOSS_OVERRIDE_REQUIRED_MSG =
  'Inventory loss from stock adjustments is posted automatically. To record a 5100 expense, tick the exceptional override and enter a reason.';

export const INVENTORY_LOSS_DUPLICATE_ADJUSTMENT_MSG =
  'An expense is already linked to this stock adjustment. Recording another would double-count inventory loss.';

export const INVENTORY_LOSS_ADJUSTMENT_NOT_FOUND_MSG =
  'Stock adjustment not found for your business.';

export const INVENTORY_LOSS_OWNER_ONLY_MSG =
  'Only the owner can record an inventory-loss override expense.';

export const INVENTORY_LOSS_SOURCE_REQUIRED_MSG =
  'Link this override to the exact stock adjustment it relates to.';

export function assertInventoryLossOverrideAuthority(input: {
  accountCode: string;
  override?: boolean;
  role?: string | null;
  sourceAdjustmentId?: string | null;
}): void {
  if (!isInventoryLossAccount(input.accountCode) || !input.override) return;
  if (input.role !== 'OWNER') {
    throw new Error(INVENTORY_LOSS_OWNER_ONLY_MSG);
  }
  if (!input.sourceAdjustmentId?.trim()) {
    throw new Error(INVENTORY_LOSS_SOURCE_REQUIRED_MSG);
  }
}

export function isInventoryLossAccount(accountCode: string | null | undefined): boolean {
  return accountCode === INVENTORY_LOSS_ACCOUNT_CODE;
}

export function assertInventoryLossExpenseAllowed(input: {
  accountCode: string;
  override?: boolean;
  reason?: string | null;
}): void {
  if (!isInventoryLossAccount(input.accountCode)) return;
  const reason = input.reason?.trim() ?? '';
  if (!input.override || !reason) {
    throw new Error(INVENTORY_LOSS_OVERRIDE_REQUIRED_MSG);
  }
}

export function composeInventoryLossNotes(
  notes: string | null | undefined,
  overrideReason: string | null | undefined,
): string | null {
  const userNotes = notes?.trim() ?? '';
  const reason = overrideReason?.trim() ?? '';
  if (!reason) return userNotes || null;
  const prefix = `Inventory-loss override: ${reason}`;
  return userNotes ? `${prefix}\n${userNotes}` : prefix;
}

export async function assertSourceAdjustmentAvailable(
  tx: { expense: { findFirst: (args: unknown) => Promise<{ id: string } | null> } },
  sourceAdjustmentId: string | null | undefined,
  businessId?: string,
): Promise<void> {
  const id = sourceAdjustmentId?.trim() || '';
  if (!id) return;
  const existing = await tx.expense.findFirst({
    where: {
      sourceAdjustmentId: id,
      ...(businessId ? { businessId } : {}),
    },
    select: { id: true },
  });
  if (existing) {
    throw new Error(INVENTORY_LOSS_DUPLICATE_ADJUSTMENT_MSG);
  }
}

export function isSourceAdjustmentUniqueConflict(error: unknown): boolean {
  return isPrismaUniqueConstraintOn(error, ['sourceAdjustmentId']);
}
