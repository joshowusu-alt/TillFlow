/**
 * Rollout gate for controlled inventory-increase Phase 2.
 * Independent of Phase 1 decrease. When disabled, increase UI/actions must
 * hide or reject — never fall back to the legacy unhardened mutation.
 *
 * Production blast radius is controlled by TWO independent conditions:
 *   1. Global flag TILLFLOW_INVENTORY_ADJUST_PHASE2_INCREASE === "1"
 *   2. Exact business ID membership in TILLFLOW_INVENTORY_ADJUST_PHASE2_BUSINESS_IDS
 *
 * Both must be true. Missing/invalid/empty allowlist fails closed (no businesses).
 * Wildcard-like values never mean "all businesses".
 *
 * Env allowlist is read via dynamic key access so Next.js does not inline a
 * build-time empty value over a runtime-configured allowlist.
 */

export const INVENTORY_INCREASE_PHASE2_BUSINESS_IDS_ENV =
  'TILLFLOW_INVENTORY_ADJUST_PHASE2_BUSINESS_IDS' as const;

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

/**
 * Parse the Phase 2 business allowlist.
 * Fail-closed: missing, empty, or fully invalid configuration → empty Set.
 * Never logs the allowlist. Exact membership only (no substring matching).
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

export function isInventoryIncreasePhase2Enabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.TILLFLOW_INVENTORY_ADJUST_PHASE2_INCREASE === '1';
}

/**
 * Exact allowlist membership for a business ID.
 * Does not consult the global flag — use isInventoryIncreasePhase2EnabledForBusiness
 * for the full gate.
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
 * Requires global flag ON and exact allowlist membership.
 * Safe for UI visibility; must also be enforced on every posting path.
 */
export function isInventoryIncreasePhase2EnabledForBusiness(
  businessId: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    isInventoryIncreasePhase2Enabled(env) &&
    isInventoryIncreasePhase2BusinessAllowlisted(businessId, env)
  );
}
