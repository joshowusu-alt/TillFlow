import { labelReferralSource, type ReferralSource, type ReferralStatus } from './constants';

export type ReferralBusinessRow = {
  businessId: string;
  businessName: string;
  referralSource: string | null;
  referralStatus: string | null;
  assignedAgent: string;
  isPaid: boolean;
  inTrial: boolean;
};

export type ReferralReport = {
  bySource: Array<{ source: string; label: string; leads: number; demoBooked: number; trials: number; paid: number }>;
  byAgent: Array<{ agent: string; total: number; paid: number }>;
  conversion: {
    demoToTrialPct: number | null;
    trialToPaidPct: number | null;
  };
  totals: {
    withSource: number;
    demoBooked: number;
    trials: number;
    paid: number;
  };
};

export function buildReferralReport(rows: ReferralBusinessRow[]): ReferralReport {
  const sourceMap = new Map<string, { leads: number; demoBooked: number; trials: number; paid: number }>();
  const agentMap = new Map<string, { total: number; paid: number }>();

  let demoCompleted = 0;
  let trials = 0;
  let paid = 0;
  let withSource = 0;

  for (const row of rows) {
    if (row.referralSource) withSource += 1;

    const source = row.referralSource ?? 'UNKNOWN';
    const bucket = sourceMap.get(source) ?? { leads: 0, demoBooked: 0, trials: 0, paid: 0 };
    bucket.leads += 1;
    if (['DEMO_BOOKED', 'DEMO_COMPLETED', 'TRIAL_STARTED', 'ONBOARDED', 'PAID'].includes(row.referralStatus ?? '')) {
      bucket.demoBooked += 1;
    }
    if (['TRIAL_STARTED', 'ONBOARDED', 'PAID'].includes(row.referralStatus ?? '')) bucket.trials += 1;
    if (row.referralStatus === 'PAID' || row.isPaid) {
      bucket.paid += 1;
      paid += 1;
    }
    if (row.referralStatus === 'DEMO_COMPLETED') demoCompleted += 1;
    if (['TRIAL_STARTED', 'ONBOARDED', 'PAID'].includes(row.referralStatus ?? '') || row.inTrial) trials += 1;
    sourceMap.set(source, bucket);

    const agent = row.assignedAgent || 'Unassigned';
    const ab = agentMap.get(agent) ?? { total: 0, paid: 0 };
    ab.total += 1;
    if (row.referralStatus === 'PAID' || row.isPaid) ab.paid += 1;
    agentMap.set(agent, ab);
  }

  const bySource = Array.from(sourceMap.entries())
    .map(([source, counts]) => ({
      source,
      label: labelReferralSource(source === 'UNKNOWN' ? null : (source as ReferralSource)),
      ...counts,
    }))
    .sort((a, b) => b.leads - a.leads);

  const byAgent = Array.from(agentMap.entries())
    .map(([agent, counts]) => ({ agent, ...counts }))
    .sort((a, b) => b.total - a.total);

  const demoBooked = rows.filter((r) =>
    ['DEMO_BOOKED', 'DEMO_COMPLETED', 'TRIAL_STARTED', 'ONBOARDED', 'PAID'].includes(r.referralStatus ?? '')
  ).length;

  return {
    bySource,
    byAgent,
    conversion: {
      demoToTrialPct: demoCompleted > 0 ? Math.round((trials / demoCompleted) * 100) : null,
      trialToPaidPct: trials > 0 ? Math.round((paid / trials) * 100) : null,
    },
    totals: { withSource, demoBooked, trials, paid },
  };
}
