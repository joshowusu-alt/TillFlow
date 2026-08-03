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
 */
export function parseInternalQaBusinessIds(
  raw: string | undefined | null = process.env.TILLFLOW_INTERNAL_QA_BUSINESS_IDS,
): Set<string> {
  if (!raw || typeof raw !== 'string') return new Set();
  return new Set(
    raw
      .split(/[,\s]+/)
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );
}

export function isInternalQaBusinessId(
  businessId: string | null | undefined,
  rawEnv: string | undefined | null = process.env.TILLFLOW_INTERNAL_QA_BUSINESS_IDS,
): boolean {
  if (!businessId || typeof businessId !== 'string') return false;
  return parseInternalQaBusinessIds(rawEnv).has(businessId);
}
