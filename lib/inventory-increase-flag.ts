/**
 * Rollout gate for controlled inventory-increase Phase 2.
 * Independent of Phase 1 decrease. When disabled, increase UI/actions must
 * hide or reject — never fall back to the legacy unhardened mutation.
 */
export function isInventoryIncreasePhase2Enabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.TILLFLOW_INVENTORY_ADJUST_PHASE2_INCREASE === '1';
}
