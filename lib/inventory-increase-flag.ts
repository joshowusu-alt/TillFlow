/**
 * Rollout gate for controlled inventory-increase Phase 2.
 * Independent of Phase 1 decrease. When disabled, increase UI/actions must
 * hide or reject — never fall back to the legacy unhardened mutation.
 *
 * Access requires ALL of:
 *   1. Global flag TILLFLOW_INVENTORY_ADJUST_PHASE2_INCREASE === "1"
 *   2. Explicit rollout mode (see below)
 *   3. Authenticated business membership + Owner/Manager (enforced outside this module)
 *
 * Rollout modes (TILLFLOW_INVENTORY_ADJUST_PHASE2_ROLLOUT_MODE):
 *   - ALLOWLIST — only exact IDs in TILLFLOW_INVENTORY_ADJUST_PHASE2_BUSINESS_IDS
 *   - GENERAL  — any business with a non-empty authenticated business ID
 *
 * Missing, empty, or unknown rollout mode fails closed (deny everywhere),
 * even when the global flag is on. Empty/absent allowlist never means "all".
 * Wildcard-like allowlist tokens are rejected.
 *
 * Env values are read via dynamic key access so Next.js does not inline
 * build-time empty values over runtime configuration.
 */

export const INVENTORY_INCREASE_PHASE2_BUSINESS_IDS_ENV =
  'TILLFLOW_INVENTORY_ADJUST_PHASE2_BUSINESS_IDS' as const;

export const INVENTORY_INCREASE_PHASE2_ROLLOUT_MODE_ENV =
  'TILLFLOW_INVENTORY_ADJUST_PHASE2_ROLLOUT_MODE' as const;

export type InventoryIncreasePhase2RolloutMode = 'ALLOWLIST' | 'GENERAL';

/** Tokens that must never grant global or wildcard Phase 2 access. */
const PHASE2_ALLOWLIST_REJECTED_TOKENS = new Set([
  '*',
  'all',
  'any',
  'true',
  'false',
  'yes',
  'no',
  '1',
  '0',
  'everyone',
  'everybody',
  'global',
]);

/**
 * Accept only exact immutable business-ID shaped tokens.
 * Rejects emails, display names, domains, globs, mixed-case labels, and free text.
 */
function isAcceptablePhase2BusinessIdToken(token: string): boolean {
  if (!token) return false;
  const lower = token.toLowerCase();
  if (PHASE2_ALLOWLIST_REJECTED_TOKENS.has(lower)) return false;
  if (/[*?]/.test(token)) return false;
  if (token.includes('@') || token.includes('.')) return false;
  // Reject mixed-case / Title Case labels (cuid and fixture IDs are lowercase).
  if (/[A-Z]/.test(token)) return false;
  // Exact ID shape: lowercase letters, digits, underscore, hyphen; min length 2.
  if (!/^[a-z0-9][a-z0-9_-]{1,127}$/.test(token)) return false;
  return true;
}

function readPhase2BusinessIdsEnv(
  env: NodeJS.ProcessEnv = process.env,
  rawOverride?: string | null,
): string | undefined | null {
  if (rawOverride !== undefined) return rawOverride;
  // Dynamic key access — avoids Next.js build-time inlining of process.env.NAME.
  return env[INVENTORY_INCREASE_PHASE2_BUSINESS_IDS_ENV];
}

function readPhase2RolloutModeEnv(
  env: NodeJS.ProcessEnv = process.env,
  rawOverride?: string | null,
): string | undefined | null {
  if (rawOverride !== undefined) return rawOverride;
  return env[INVENTORY_INCREASE_PHASE2_ROLLOUT_MODE_ENV];
}

/**
 * Parse the Phase 2 business allowlist.
 * Fail-closed: missing, empty, or fully invalid configuration → empty Set.
 * Never logs the allowlist. Exact membership only (no substring matching).
 * Used only when rollout mode is ALLOWLIST.
 */
export function parseInventoryIncreasePhase2BusinessIds(
  raw?: string | null,
  env: NodeJS.ProcessEnv = process.env,
): Set<string> {
  const ids = new Set<string>();
  const value = readPhase2BusinessIdsEnv(env, raw);
  if (!value || typeof value !== 'string') return ids;

  for (const part of value.split(/[,\s]+/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (!isAcceptablePhase2BusinessIdToken(trimmed)) continue;
    ids.add(trimmed);
  }
  return ids;
}

/**
 * Resolve explicit rollout mode.
 * Only ALLOWLIST and GENERAL are accepted. Anything else (including missing) → null (fail closed).
 */
export function parseInventoryIncreasePhase2RolloutMode(
  raw?: string | null,
  env: NodeJS.ProcessEnv = process.env,
): InventoryIncreasePhase2RolloutMode | null {
  const value = readPhase2RolloutModeEnv(env, raw);
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === 'ALLOWLIST') return 'ALLOWLIST';
  if (normalized === 'GENERAL') return 'GENERAL';
  return null;
}

export function isInventoryIncreasePhase2Enabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.TILLFLOW_INVENTORY_ADJUST_PHASE2_INCREASE === '1';
}

/**
 * Exact allowlist membership for a business ID.
 * Does not consult the global flag or rollout mode — use
 * isInventoryIncreasePhase2EnabledForBusiness for the full gate.
 */
export function isInventoryIncreasePhase2BusinessAllowlisted(
  businessId: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
  rawAllowlist?: string | null,
): boolean {
  if (!businessId || typeof businessId !== 'string') return false;
  return parseInventoryIncreasePhase2BusinessIds(rawAllowlist, env).has(businessId);
}

/**
 * Authoritative Phase 2 eligibility for a business.
 * Requires global flag ON and an explicit valid rollout mode.
 * - ALLOWLIST: exact allowlist membership required
 * - GENERAL: any non-empty business ID is rollout-eligible (role/membership still enforced elsewhere)
 * Safe for UI visibility; must also be enforced on every posting path.
 */
export function isInventoryIncreasePhase2EnabledForBusiness(
  businessId: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!businessId || typeof businessId !== 'string' || !businessId.trim()) {
    return false;
  }
  if (!isInventoryIncreasePhase2Enabled(env)) {
    return false;
  }

  const mode = parseInventoryIncreasePhase2RolloutMode(undefined, env);
  if (mode === 'GENERAL') {
    return true;
  }
  if (mode === 'ALLOWLIST') {
    return isInventoryIncreasePhase2BusinessAllowlisted(businessId, env);
  }
  // Missing / invalid / unknown mode → fail closed.
  return false;
}
