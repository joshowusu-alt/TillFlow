/**
 * Rollout gate for lean inventory-decrease Phase 1.
 * When disabled, creation UI/actions must hide or reject — never fall back to
 * the legacy unhardened `createStockAdjustment` mutation.
 */
export function isInventoryDecreasePhase1Enabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.TILLFLOW_INVENTORY_ADJUST_PHASE1 === '1';
}
