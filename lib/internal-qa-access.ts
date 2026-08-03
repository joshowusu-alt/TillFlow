/**
 * Explicit internal-QA business allowlist for TillFlow-owned smoke tenants.
 *
 * Security boundary: exact business IDs from env only.
 * - Not inferred from tenant name
 * - Not inferred from email domain
 * - Not inferred from isDemo alone
 * - Not activatable by ordinary tenant users
 *
 * Env: TILLFLOW_INTERNAL_QA_BUSINESS_IDS=id1,id2
 *
 * Read via dynamic env access so Next.js does not inline a build-time empty value.
 */
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
  const value = readInternalQaBusinessIdsEnv(raw);
  if (!value || typeof value !== 'string') return new Set();
  return new Set(
    value
      .split(/[,\s]+/)
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );
}

export function isInternalQaBusinessId(
  businessId: string | null | undefined,
  rawEnv?: string | undefined | null,
): boolean {
  if (!businessId || typeof businessId !== 'string') return false;
  return parseInternalQaBusinessIds(rawEnv).has(businessId);
}
