import type { ManagedBusiness } from '../../lib/control-data';
import { FORBIDDEN_MOCK_PORTFOLIO_IDS } from '@tillflow/lib/control-money';

/**
 * Test-only catalog. Runtime control-data and control-service must never
 * return these rows when the live query is empty or fails.
 */
export const MOCK_PORTFOLIO_FIXTURE: ManagedBusiness[] = [
  {
    id: 'adom-mart',
    name: 'Adom Mart',
    ownerName: 'Abena Owusu',
    ownerPhone: '+233 24 555 1101',
    ownerEmail: 'abena@adommart.example',
    assignedManager: 'Kojo Mensah',
    plan: 'STARTER',
    effectivePlan: 'STARTER',
    state: 'PAID_ACTIVE',
    billingCadence: 'MONTHLY',
    signedUpAt: '2026-02-15',
    planSetAt: '2026-02-15',
    nextDueAt: '2026-04-25',
    lastPaymentAt: '2026-03-25',
    monthlyValue: 199,
    outstandingAmount: 0,
    health: 'HEALTHY',
    needsReview: false,
    reviewedAt: '2026-04-01 09:15',
    reviewedBy: 'Kojo Mensah',
    lastActivityAt: '2026-04-08 11:10',
    branches: 1,
    notes: 'Test-only mock row. Must never ship as live portfolio data.',
  },
  {
    id: 'capstone-grocers',
    name: 'Capstone Grocers',
    ownerName: 'Daniel Ofori',
    ownerPhone: '+233 26 880 9302',
    ownerEmail: 'daniel@capstonegrocers.example',
    assignedManager: 'Esi Quansah',
    plan: 'GROWTH',
    effectivePlan: 'GROWTH',
    state: 'PAID_ACTIVE',
    billingCadence: 'ANNUAL',
    signedUpAt: '2025-11-04',
    planSetAt: '2026-01-02',
    nextDueAt: '2027-01-02',
    lastPaymentAt: '2026-01-02',
    monthlyValue: 291,
    outstandingAmount: 0,
    health: 'HEALTHY',
    needsReview: false,
    reviewedAt: '2026-01-04 09:00',
    reviewedBy: 'Esi Quansah',
    lastActivityAt: '2026-04-08 07:59',
    branches: 1,
    notes: 'Test-only annual mock row.',
  },
];

export { FORBIDDEN_MOCK_PORTFOLIO_IDS };

export function fixtureContainsForbiddenIds(businesses: Array<{ id: string }>) {
  const forbidden = new Set<string>(FORBIDDEN_MOCK_PORTFOLIO_IDS);
  return businesses.some((business) => forbidden.has(business.id));
}
