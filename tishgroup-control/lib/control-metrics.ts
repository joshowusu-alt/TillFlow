import { managedBusinesses, planRates, type ManagedBusiness } from '@/lib/control-data';

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

export function formatCedi(value: number) {
  return `GHc ${value.toLocaleString('en-GH')}`;
}

export function getPortfolioSummary() {
  return getPortfolioSummaryFor(managedBusinesses);
}

export function getPortfolioSummaryFor(businesses: ManagedBusiness[]) {
  const activeBusinesses = businesses.filter((business) => business.state !== 'INACTIVE');
  const totalBusinesses = businesses.length;
  const mrr = sum(activeBusinesses.map((business) => business.monthlyValue));
  const expectedCollections = sum(
    activeBusinesses
      .filter((business) => business.state === 'DUE_SOON' || business.state === 'GRACE' || business.state === 'STARTER_FALLBACK' || business.state === 'READ_ONLY')
      .map((business) => business.outstandingAmount)
  );
  const activePaid = activeBusinesses.filter((business) => business.state === 'ACTIVE').length;
  const dueSoon = activeBusinesses.filter((business) => business.state === 'DUE_SOON').length;
  const grace = activeBusinesses.filter((business) => business.state === 'GRACE').length;
  const fallback = activeBusinesses.filter((business) => business.state === 'STARTER_FALLBACK').length;
  const readOnly = activeBusinesses.filter((business) => business.state === 'READ_ONLY').length;

  return {
    totalBusinesses,
    mrr,
    arr: mrr * 12,
    expectedCollections,
    activePaid,
    dueSoon,
    grace,
    fallback,
    readOnly,
  };
}

export function getRevenueByPlan() {
  return getRevenueByPlanFor(managedBusinesses);
}

export function getRevenueByPlanFor(businesses: ManagedBusiness[]) {
  return (Object.keys(planRates) as Array<keyof typeof planRates>).map((plan) => {
    const matchingBusinesses = businesses.filter((business) => business.plan === plan && business.state !== 'INACTIVE');
    const revenue = sum(matchingBusinesses.map((business) => business.monthlyValue));

    return {
      plan,
      count: matchingBusinesses.length,
      revenue,
    };
  });
}

export function getCollectionQueues() {
  return getCollectionQueuesFor(managedBusinesses);
}

export function getCollectionQueuesFor(businesses: ManagedBusiness[]) {
  return {
    healthy: businesses.filter((business) => business.state === 'ACTIVE' || business.state === 'TRIAL'),
    dueSoon: businesses.filter((business) => business.state === 'DUE_SOON'),
    overdue: businesses.filter((business) => business.state === 'GRACE' || business.state === 'STARTER_FALLBACK'),
    locked: businesses.filter((business) => business.state === 'READ_ONLY'),
  };
}

export function getBusinessById(businessId: string) {
  return managedBusinesses.find((business) => business.id === businessId);
}

export function getAgingBucketsFor(businesses: ManagedBusiness[]) {
  const active = businesses.filter((b) => b.state !== 'INACTIVE');
  const approachingList = active.filter((b) => b.state === 'DUE_SOON');
  const overdueList = active.filter((b) => b.state === 'GRACE' || b.state === 'STARTER_FALLBACK');
  const lockedList = active.filter((b) => b.state === 'READ_ONLY');
  const currentList = active.filter((b) => b.state === 'ACTIVE' || b.state === 'TRIAL');

  return {
    current: {
      count: currentList.length,
      amount: sum(currentList.map((b) => b.monthlyValue)),
      label: 'Healthy',
      description: 'Active and up to date — no billing action needed right now.',
      href: '/collections#healthy',
    },
    approaching: {
      count: approachingList.length,
      amount: sum(approachingList.map((b) => b.outstandingAmount)),
      label: 'Due now',
      description: 'In billing window. Send reminders before these tip into overdue.',
      href: '/collections#dueSoon',
    },
    overdue: {
      count: overdueList.length,
      amount: sum(overdueList.map((b) => b.outstandingAmount)),
      label: 'Overdue',
      description: 'Operating on grace or fallback. Same-day contact required.',
      href: '/collections#overdue',
    },
    locked: {
      count: lockedList.length,
      amount: sum(lockedList.map((b) => b.outstandingAmount)),
      label: 'Locked',
      description: 'Access restricted. Confirm payment or make a commercial decision.',
      href: '/collections#locked',
    },
  };
}

export function getActionChecklist(business: ManagedBusiness) {
  switch (business.state) {
    case 'DUE_SOON':
      return ['Send reminder now', 'Confirm payment method', 'Verify owner contact is current'];
    case 'GRACE':
      return ['Call owner today', 'Record promised payment date', 'Escalate if no proof by close of day'];
    case 'STARTER_FALLBACK':
      return ['Escalate to account manager', 'Warn owner of read-only date', 'Prepare same-day restoration if payment lands'];
    case 'READ_ONLY':
      return ['Confirm payment status', 'Record payment and restore access if settled', 'Log root cause for churn risk'];
    case 'TRIAL':
      return ['Book conversion meeting', 'Show reporting value used in trial', 'Set paid plan before trial end'];
    case 'INACTIVE':
      return ['Keep the account archived', 'Do not include in active billing follow-up', 'Reactivate only if the business returns to service'];
    case 'ACTIVE':
    default:
      return ['Monitor usage health', 'Review upsell path', 'Keep renewal note current'];
  }
}