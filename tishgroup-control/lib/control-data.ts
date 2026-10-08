export type ManagedPlan = 'STARTER' | 'GROWTH' | 'PRO';

export type ManagedState =
  | 'TRIAL_ACTIVE'
  | 'TRIAL_DUE_SOON'
  | 'TRIAL_DUE_TODAY'
  | 'TRIAL_EXPIRED_GRACE'
  | 'TRIAL_RESTRICTED'
  | 'PAID_ACTIVE'
  | 'RENEWAL_DUE_SOON'
  | 'PAYMENT_DUE_TODAY'
  | 'PAYMENT_OVERDUE_GRACE'
  | 'PAYMENT_RESTRICTED'
  | 'CANCELLED'
  | 'READ_ONLY'
  | 'ACTIVE'
  | 'TRIAL'
  | 'GRACE'
  | 'STARTER_FALLBACK'
  | 'INACTIVE'
  | 'SUSPENDED';

export type BusinessHealth = 'HEALTHY' | 'WATCH' | 'AT_RISK';

export type ManagedBusiness = {
  id: string;
  name: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  assignedManager: string;
  plan: ManagedPlan;
  effectivePlan: ManagedPlan;
  state: ManagedState;
  billingCadence: 'MONTHLY' | 'ANNUAL';
  subscriptionStartAt?: string | null;
  signedUpAt: string;
  planSetAt: string;
  trialStartAt?: string | null;
  trialEndAt?: string | null;
  daysLeft?: number | null;
  nextDueAt: string;
  lastPaymentAt: string | null;
  monthlyValue: number;
  outstandingAmount: number;
  health: BusinessHealth;
  needsReview: boolean;
  reviewedAt: string | null;
  reviewedBy: string | null;
  lastActivityAt: string;
  branches: number;
  notes: string;
  lastReminderAt?: string | null;
  lastReminderStatus?: string | null;
  nextReminderAt?: string | null;
  failedReminderCount?: number;
};

export type PortfolioAvailability = 'ok' | 'empty' | 'unavailable';

export type PortfolioErrorKind =
  | 'none'
  | 'missing_table'
  | 'timeout'
  | 'pool'
  | 'permission'
  | 'query_failed';

export type PortfolioSnapshot = {
  businesses: ManagedBusiness[];
  availability: PortfolioAvailability;
  errorKind: PortfolioErrorKind;
};

export const planRates: Record<ManagedPlan, number> = {
  STARTER: 199,
  GROWTH: 349,
  PRO: 699,
};

export function classifyPortfolioError(error: unknown): Exclude<PortfolioErrorKind, 'none'> {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();

  if (
    message.includes('no such table')
    || message.includes('does not exist in the current database')
    || (message.includes('relation') && message.includes('does not exist'))
  ) {
    return 'missing_table';
  }

  if (
    message.includes('etimedout')
    || message.includes('timed out')
    || message.includes('timeout')
    || message.includes('statement timeout')
  ) {
    return 'timeout';
  }

  if (
    message.includes('too many connections')
    || message.includes('remaining connection slots')
    || message.includes('connection pool')
    || (message.includes('pool') && (message.includes('exhaust') || message.includes('timeout')))
  ) {
    return 'pool';
  }

  if (
    message.includes('permission denied')
    || message.includes('access denied')
    || message.includes('not authorized')
    || message.includes('insufficient privilege')
  ) {
    return 'permission';
  }

  return 'query_failed';
}

export function emptyPortfolioSnapshot(
  availability: Exclude<PortfolioAvailability, 'ok'> = 'empty',
  errorKind: PortfolioErrorKind = 'none',
): PortfolioSnapshot {
  if (availability === 'unavailable' && errorKind === 'none') {
    return { businesses: [], availability, errorKind: 'query_failed' };
  }

  return { businesses: [], availability, errorKind };
}

export function snapshotFromBusinessRows(businesses: ManagedBusiness[]): PortfolioSnapshot {
  if (businesses.length === 0) {
    return emptyPortfolioSnapshot('empty', 'none');
  }

  return { businesses, availability: 'ok', errorKind: 'none' };
}

export function snapshotFromQueryFailure(error: unknown): PortfolioSnapshot {
  return emptyPortfolioSnapshot('unavailable', classifyPortfolioError(error));
}

export function inferHealth(state: ManagedState): BusinessHealth {
  if (state === 'CANCELLED') return 'WATCH';
  if (
    state === 'READ_ONLY'
    || state === 'TRIAL_RESTRICTED'
    || state === 'PAYMENT_RESTRICTED'
    || state === 'PAYMENT_OVERDUE_GRACE'
    || state === 'TRIAL_EXPIRED_GRACE'
  ) {
    return 'AT_RISK';
  }
  if (
    state === 'TRIAL_DUE_SOON'
    || state === 'TRIAL_DUE_TODAY'
    || state === 'RENEWAL_DUE_SOON'
    || state === 'PAYMENT_DUE_TODAY'
  ) {
    return 'WATCH';
  }
  return 'HEALTHY';
}

export function resolveFirstPaymentAt(args: {
  firstPaymentAt?: Date | string | null;
  lastPaymentDate?: Date | string | null;
  lastPaymentAt?: Date | string | null;
}) {
  return args.firstPaymentAt ?? null;
}

export function resolveInternalNotes(args: {
  latestNote?: string | null;
  profileNotes?: string | null;
}) {
  return args.latestNote ?? args.profileNotes ?? 'No internal control-plane note recorded yet.';
}

export type ErrorLogHealthInput =
  | { ok: true; errors: unknown[] }
  | { ok: false; errorKind: 'missing_table' | 'query_failed'; errors: unknown[] };

export function classifyErrorLogFailure(error: unknown): 'missing_table' | 'query_failed' {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (
    message.includes('no such table')
    || message.includes('does not exist in the current database')
    || (message.includes('relation') && message.includes('does not exist'))
  ) {
    return 'missing_table';
  }
  return 'query_failed';
}

export function errorLogHealthCopy(result: ErrorLogHealthInput): {
  isHealthy: boolean;
  description: string;
  emptyMessage: string;
} {
  if (!result.ok) {
    return {
      isHealthy: false,
      description: 'The error log could not be loaded. Platform health is unknown until this query succeeds.',
      emptyMessage: 'Error log unavailable. Do not treat this as a healthy platform.',
    };
  }

  if (result.errors.length === 0) {
    return {
      isHealthy: true,
      description: 'No errors recorded. All critical operations are running cleanly.',
      emptyMessage: 'No system errors recorded. All critical operations are running cleanly.',
    };
  }

  return {
    isHealthy: false,
    description: `Showing the ${result.errors.length} most recent system errors. Click any business link to investigate the account.`,
    emptyMessage: '',
  };
}

export function portfolioAvailabilityMessage(snapshot: PortfolioSnapshot): string | null {
  if (snapshot.availability === 'unavailable') {
    return 'Live portfolio data is unavailable. This is not an empty book — the query failed.';
  }

  if (snapshot.availability === 'empty') {
    return 'No live businesses in the portfolio yet. Sample accounts are not shown.';
  }

  return null;
}
