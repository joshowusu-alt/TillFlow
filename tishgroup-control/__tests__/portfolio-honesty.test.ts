import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  classifyErrorLogFailure,
  classifyPortfolioError,
  emptyPortfolioSnapshot,
  errorLogHealthCopy,
  inferHealth,
  resolveFirstPaymentAt,
  resolveInternalNotes,
  snapshotFromBusinessRows,
  snapshotFromQueryFailure,
} from '../lib/control-data';
import {
  amountDueGhs,
  getAccountMove,
  getPortfolioSummary,
  getPortfolioSummaryFor,
} from '../lib/control-metrics';
import { FORBIDDEN_MOCK_PORTFOLIO_IDS } from '@tillflow/lib/control-money';
import { fixtureContainsForbiddenIds, MOCK_PORTFOLIO_FIXTURE } from './fixtures/mock-portfolio';
import type { ManagedBusiness } from '../lib/control-data';

function makeBusiness(overrides: Partial<ManagedBusiness> = {}): ManagedBusiness {
  return {
    id: 'live-business',
    name: 'Live Business',
    ownerName: 'Owner',
    ownerPhone: '+233201234567',
    ownerEmail: 'owner@test.com',
    plan: 'STARTER',
    effectivePlan: 'STARTER',
    state: 'PAID_ACTIVE',
    billingCadence: 'MONTHLY',
    signedUpAt: '2026-01-01',
    planSetAt: '2026-01-01',
    monthlyValue: 199,
    outstandingAmount: 0,
    nextDueAt: '2026-06-01',
    lastPaymentAt: null,
    assignedManager: 'Unassigned',
    needsReview: false,
    reviewedAt: null,
    reviewedBy: null,
    lastActivityAt: '2026-05-01',
    branches: 1,
    notes: '',
    health: 'HEALTHY',
    ...overrides,
  };
}

describe('zero rows vs mock rows', () => {
  it('treats an empty query as empty, never as the mock catalog', () => {
    const snapshot = snapshotFromBusinessRows([]);
    expect(snapshot.availability).toBe('empty');
    expect(snapshot.errorKind).toBe('none');
    expect(snapshot.businesses).toEqual([]);
    expect(fixtureContainsForbiddenIds(snapshot.businesses)).toBe(false);
    expect(snapshot.businesses.some((business) => business.id === 'adom-mart')).toBe(false);
  });

  it('does not embed forbidden mock portfolio IDs in runtime control-data', () => {
    const source = readFileSync(join(__dirname, '../lib/control-data.ts'), 'utf8');
    for (const id of FORBIDDEN_MOCK_PORTFOLIO_IDS) {
      expect(source).not.toContain(id);
    }
    expect(source).not.toContain('managedBusinesses');
    expect(source).not.toContain('Adom Mart');
  });
});

describe('query exception vs mock rows', () => {
  it('classifies timeout, pool, permission, and missing-table failures', () => {
    expect(classifyPortfolioError(new Error('connect ETIMEDOUT'))).toBe('timeout');
    expect(classifyPortfolioError(new Error('Timed out after 15s'))).toBe('timeout');
    expect(classifyPortfolioError(new Error('connection pool exhausted'))).toBe('pool');
    expect(classifyPortfolioError(new Error('too many connections'))).toBe('pool');
    expect(classifyPortfolioError(new Error('permission denied for table Business'))).toBe('permission');
    expect(classifyPortfolioError(new Error('no such table: Business'))).toBe('missing_table');
    expect(classifyPortfolioError(new Error('relation "Business" does not exist'))).toBe('missing_table');
    expect(classifyPortfolioError(new Error('boom'))).toBe('query_failed');
  });

  it('returns an empty unavailable snapshot on query exception, not mock rows', () => {
    const snapshot = snapshotFromQueryFailure(new Error('connect ETIMEDOUT'));
    expect(snapshot.availability).toBe('unavailable');
    expect(snapshot.errorKind).toBe('timeout');
    expect(snapshot.businesses).toEqual([]);
    expect(fixtureContainsForbiddenIds(snapshot.businesses)).toBe(false);
    expect(emptyPortfolioSnapshot('unavailable', 'query_failed').businesses).toEqual([]);
  });
});

describe('error log honesty', () => {
  it('does not treat a missing table as a healthy error page', () => {
    const failure = classifyErrorLogFailure(new Error('no such table: ControlAuditLog'));
    expect(failure).toBe('missing_table');
    const copy = errorLogHealthCopy({ ok: false, errorKind: failure, errors: [] });
    expect(copy.isHealthy).toBe(false);
    expect(copy.emptyMessage.toLowerCase()).not.toMatch(/running cleanly/);
    expect(copy.emptyMessage.toLowerCase()).toMatch(/unavailable/);
    expect(copy.description.toLowerCase()).toMatch(/could not be loaded|unknown/);
  });

  it('only calls the platform clean when the query succeeded with zero rows', () => {
    const healthy = errorLogHealthCopy({ ok: true, errors: [] });
    expect(healthy.isHealthy).toBe(true);
    expect(healthy.emptyMessage).toMatch(/running cleanly/);
  });
});

describe('paid MRR and ARR honesty', () => {
  it('never invents fake MRR from the mock catalog or an empty book', () => {
    expect(getPortfolioSummary().mrr).toBe(0);
    expect(getPortfolioSummary().arr).toBe(0);
    expect(getPortfolioSummary().totalBusinesses).toBe(0);
    expect(getPortfolioSummaryFor([]).mrr).toBe(0);
  });

  it('excludes trial states from paid MRR', () => {
    const summary = getPortfolioSummaryFor([
      makeBusiness({ state: 'TRIAL_ACTIVE', monthlyValue: 349 }),
      makeBusiness({ state: 'PAID_ACTIVE', monthlyValue: 199 }),
    ]);
    expect(summary.mrr).toBe(199);
  });

  it('does not compute mixed-portfolio ARR as mrr * 12', () => {
    const summary = getPortfolioSummaryFor([
      makeBusiness({ id: 'monthly', monthlyValue: 199, billingCadence: 'MONTHLY' }),
      makeBusiness({ id: 'annual', monthlyValue: 349, billingCadence: 'ANNUAL' }),
    ]);
    expect(summary.mrr).toBe(548);
    expect(summary.arr).toBe(199 * 12 + 349 * 10);
    expect(summary.arr).not.toBe(summary.mrr * 12);
  });

  it('keeps mock fixture MRR out of runtime empty summaries', () => {
    const mockMrr = MOCK_PORTFOLIO_FIXTURE.reduce((sum, business) => sum + business.monthlyValue, 0);
    expect(mockMrr).toBeGreaterThan(0);
    expect(getPortfolioSummaryFor([]).mrr).not.toBe(mockMrr);
  });
});

describe('payment dates, notes, and health', () => {
  it('does not infer firstPaymentAt from PAID_ACTIVE + startDate', () => {
    expect(resolveFirstPaymentAt({
      firstPaymentAt: null,
      lastPaymentDate: null,
      lastPaymentAt: null,
    })).toBeNull();
  });

  it('does not fall back to billing notes for internal notes', () => {
    expect(resolveInternalNotes({ latestNote: null, profileNotes: null })).toBe(
      'No internal control-plane note recorded yet.',
    );
    expect(resolveInternalNotes({ latestNote: 'Control note', profileNotes: 'Profile note' })).toBe('Control note');
  });

  it('marks cancelled as WATCH and overdue/restricted as AT_RISK', () => {
    expect(inferHealth('CANCELLED')).toBe('WATCH');
    expect(inferHealth('PAYMENT_OVERDUE_GRACE')).toBe('AT_RISK');
    expect(inferHealth('TRIAL_EXPIRED_GRACE')).toBe('AT_RISK');
    expect(inferHealth('PAYMENT_RESTRICTED')).toBe('AT_RISK');
    expect(inferHealth('TRIAL_RESTRICTED')).toBe('AT_RISK');
    expect(inferHealth('READ_ONLY')).toBe('AT_RISK');
    expect(inferHealth('PAID_ACTIVE')).toBe('HEALTHY');
  });
});

describe('collections and amount-due copy', () => {
  it('never calls overdue, restricted, or due-soon accounts in good standing', () => {
    const risky = [
      'RENEWAL_DUE_SOON',
      'PAYMENT_DUE_TODAY',
      'TRIAL_DUE_SOON',
      'TRIAL_DUE_TODAY',
      'PAYMENT_OVERDUE_GRACE',
      'TRIAL_EXPIRED_GRACE',
      'PAYMENT_RESTRICTED',
      'TRIAL_RESTRICTED',
      'READ_ONLY',
    ];
    for (const state of risky) {
      expect(getAccountMove(state, '2026-04-01')).not.toMatch(/good standing/i);
    }
  });

  it('prefers outstandingAmount and does not use monthlyValue as amount due', () => {
    expect(amountDueGhs(makeBusiness({ outstandingAmount: 1990, monthlyValue: 199, billingCadence: 'ANNUAL' }))).toBe(1990);
    expect(amountDueGhs(makeBusiness({ outstandingAmount: 0, monthlyValue: 349, state: 'PAID_ACTIVE' }))).toBe(0);
  });
});
