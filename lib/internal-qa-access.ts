/**
 * Explicit internal-QA business allowlist for TillFlow-owned smoke tenants.
 *
 * Security boundary: exact business IDs only.
 * - Not inferred from tenant name
 * - Not inferred from email domain
 * - Not inferred from isDemo alone
 * - Not activatable by ordinary tenant users
 *
 * Built-in IDs are source-auditable (authorised TillFlow QA tenants).
 * Optional env TILLFLOW_INTERNAL_QA_BUSINESS_IDS can add further exact IDs.
 *
 * Env is read via dynamic key access so Next.js does not inline a build-time
 * empty value over the optional allowlist extension.
 */

/** TillFlow QA Demo — INTERNAL_QA_TENANT (authorised Production smoke tenant). */
export const BUILTIN_INTERNAL_QA_BUSINESS_IDS = [
  'cmr2h7pna55f22d2288316407',
] as const;

function readInternalQaBusinessIdsEnv(
  raw?: string | null,
): string | undefined | null {
  if (raw !== undefined) return raw;
  // Dynamic key access — avoids Next.js build-time inlining of process.env.NAME.
  return process.env['TILLFLOW_INTERNAL_QA_BUSINESS_IDS'];
}

export function parseInternalQaBusinessIds(
  raw?: string | undefined | null,
): Set<string> {
  const ids = new Set<string>(BUILTIN_INTERNAL_QA_BUSINESS_IDS);
  const value = readInternalQaBusinessIdsEnv(raw);
  if (!value || typeof value !== 'string') return ids;
  for (const id of value.split(/[,\s]+/)) {
    const trimmed = id.trim();
    if (trimmed.length > 0) ids.add(trimmed);
  }
  return ids;
}

export function isInternalQaBusinessId(
  businessId: string | null | undefined,
  rawEnv?: string | undefined | null,
): boolean {
  if (!businessId || typeof businessId !== 'string') return false;
  return parseInternalQaBusinessIds(rawEnv).has(businessId);
}
