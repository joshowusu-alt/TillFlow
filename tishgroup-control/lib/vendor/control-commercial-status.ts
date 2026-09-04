/**
 * Canonical commercial-status contract shared by TillFlow bootstrap and TishGroup.
 * Unknown or legacy values must never default to PAID_ACTIVE.
 */

export const CANONICAL_STORED_STATUSES = [
  'TRIAL_ACTIVE',
  'PAID_ACTIVE',
  'TRIAL_RESTRICTED',
  'PAYMENT_RESTRICTED',
  'READ_ONLY',
  'CANCELLED',
] as const;

export type CanonicalStoredStatus = (typeof CANONICAL_STORED_STATUSES)[number];

export const EDITOR_STATUSES = CANONICAL_STORED_STATUSES;

export const DERIVED_DISPLAY_STATUSES = [
  'TRIAL_ACTIVE',
  'TRIAL_DUE_SOON',
  'TRIAL_DUE_TODAY',
  'TRIAL_EXPIRED_GRACE',
  'TRIAL_RESTRICTED',
  'PAID_ACTIVE',
  'RENEWAL_DUE_SOON',
  'PAYMENT_DUE_TODAY',
  'PAYMENT_OVERDUE_GRACE',
  'PAYMENT_RESTRICTED',
  'READ_ONLY',
  'CANCELLED',
] as const;

export type DerivedDisplayStatus = (typeof DERIVED_DISPLAY_STATUSES)[number];

export type CommercialFamily = 'trial' | 'paid' | 'restricted' | 'read_only' | 'cancelled';

export class UnknownCommercialStatusError extends Error {
  readonly code = 'UNKNOWN_COMMERCIAL_STATUS';
  readonly rawValue: string;

  constructor(rawValue: string) {
    super(`Unknown commercial status ${JSON.stringify(rawValue)}. Paid access was not applied.`);
    this.name = 'UnknownCommercialStatusError';
    this.rawValue = rawValue;
  }
}

const CANONICAL_SET = new Set<string>(CANONICAL_STORED_STATUSES);

const LEGACY_TO_CANONICAL: Record<string, CanonicalStoredStatus> = {
  TRIAL: 'TRIAL_ACTIVE',
  TRIAL_EXPIRING_SOON: 'TRIAL_ACTIVE',
  TRIAL_DUE_SOON: 'TRIAL_ACTIVE',
  TRIAL_DUE_TODAY: 'TRIAL_ACTIVE',
  TRIAL_EXPIRED_GRACE: 'TRIAL_ACTIVE',
  RENEWAL_DUE_SOON: 'PAID_ACTIVE',
  PAYMENT_DUE_TODAY: 'PAID_ACTIVE',
  PAYMENT_OVERDUE_GRACE: 'PAID_ACTIVE',
  SUSPENDED: 'READ_ONLY',
  INACTIVE: 'CANCELLED',
  DEACTIVATED: 'CANCELLED',
};

export function isCanonicalStoredStatus(value: string): value is CanonicalStoredStatus {
  return CANONICAL_SET.has(value);
}

export function normalizeCommercialStatusInput(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase();
}

/**
 * Signup / bootstrap write path. Legacy trial tokens become TRIAL_ACTIVE.
 * Unknown values fail closed — they never become PAID_ACTIVE or ACTIVE.
 */
export function canonicalTrialBootstrapStatus(value?: string | null): CanonicalStoredStatus {
  const raw = normalizeCommercialStatusInput(value);
  if (!raw || raw === 'TRIAL' || raw === 'TRIAL_EXPIRING_SOON' || raw === 'TRIAL_ACTIVE') {
    return 'TRIAL_ACTIVE';
  }
  if (raw === 'TRIAL_RESTRICTED') return 'TRIAL_RESTRICTED';
  if (raw === 'READ_ONLY' || raw === 'SUSPENDED') return 'READ_ONLY';
  if (raw === 'CANCELLED' || raw === 'INACTIVE' || raw === 'DEACTIVATED') return 'CANCELLED';
  if (raw === 'PAID_ACTIVE' || raw === 'PAYMENT_RESTRICTED') {
    throw new UnknownCommercialStatusError(raw);
  }
  throw new UnknownCommercialStatusError(raw || '(empty)');
}

/**
 * Mutation path: unknown values throw. Legacy aliases map to a non-paid canonical state.
 * ACTIVE is not accepted — it previously collapsed to PAID_ACTIVE.
 */
export function parseStoredStatusForMutation(value: string | null | undefined): CanonicalStoredStatus {
  const raw = normalizeCommercialStatusInput(value);
  if (isCanonicalStoredStatus(raw)) return raw;
  const mapped = LEGACY_TO_CANONICAL[raw];
  if (mapped) return mapped;
  throw new UnknownCommercialStatusError(raw || '(empty)');
}

/**
 * Read/preserve path for existing rows. Never invents PAID_ACTIVE for unknown/legacy values.
 */
export function coerceExistingStoredStatus(value: string | null | undefined): CanonicalStoredStatus {
  const raw = normalizeCommercialStatusInput(value);
  if (isCanonicalStoredStatus(raw)) return raw;
  const mapped = LEGACY_TO_CANONICAL[raw];
  if (mapped) return mapped;
  if (!raw || raw === 'ACTIVE') return 'TRIAL_ACTIVE';
  throw new UnknownCommercialStatusError(raw);
}

export function editorStatusFromStoredOrDerived(value: string | null | undefined): CanonicalStoredStatus {
  return coerceExistingStoredStatus(value);
}

export function commercialFamily(status: CanonicalStoredStatus | DerivedDisplayStatus | string): CommercialFamily {
  const raw = normalizeCommercialStatusInput(status);
  if (raw === 'CANCELLED' || raw === 'INACTIVE' || raw === 'DEACTIVATED') return 'cancelled';
  if (raw === 'READ_ONLY' || raw === 'SUSPENDED') return 'read_only';
  if (raw === 'TRIAL_RESTRICTED' || raw === 'PAYMENT_RESTRICTED') return 'restricted';
  if (raw.startsWith('TRIAL')) return 'trial';
  if (
    raw === 'PAID_ACTIVE'
    || raw === 'RENEWAL_DUE_SOON'
    || raw === 'PAYMENT_DUE_TODAY'
    || raw === 'PAYMENT_OVERDUE_GRACE'
  ) {
    return 'paid';
  }
  throw new UnknownCommercialStatusError(raw || '(empty)');
}

export function isTrialStatus(status: string): boolean {
  return commercialFamily(status) === 'trial';
}

export function isCancelledStatus(status: string): boolean {
  return commercialFamily(status) === 'cancelled';
}

export function isPaidAccessStatus(status: string): boolean {
  return commercialFamily(status) === 'paid';
}

export function isRestrictedAccessStatus(status: string): boolean {
  const family = commercialFamily(status);
  return family === 'restricted' || family === 'read_only';
}

export function businessPlanStatusFromCanonical(status: CanonicalStoredStatus): CanonicalStoredStatus {
  if (isTrialStatus(status)) return 'TRIAL_ACTIVE';
  if (status === 'CANCELLED') return 'CANCELLED';
  if (status === 'READ_ONLY') return 'READ_ONLY';
  if (status === 'TRIAL_RESTRICTED') return 'TRIAL_RESTRICTED';
  if (status === 'PAYMENT_RESTRICTED') return 'PAYMENT_RESTRICTED';
  return 'PAID_ACTIVE';
}

export function businessSubscriptionStatusFromCanonical(status: CanonicalStoredStatus): CanonicalStoredStatus {
  return status;
}

export function shouldRevokeMerchantSessions(status: CanonicalStoredStatus): boolean {
  return status === 'CANCELLED' || status === 'READ_ONLY' || status === 'PAYMENT_RESTRICTED' || status === 'TRIAL_RESTRICTED';
}

export function paidActivationAllowed(args: {
  requestedStatus: CanonicalStoredStatus;
  hasQualifyingPaidSettlement: boolean;
  explicitEntitlementGrant?: boolean;
}): boolean {
  if (args.requestedStatus !== 'PAID_ACTIVE') return true;
  return Boolean(args.hasQualifyingPaidSettlement || args.explicitEntitlementGrant);
}
