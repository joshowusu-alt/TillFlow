import Link from 'next/link';
import ControlPageHeader from '@/components/control-page-header';
import { requireControlStaff } from '@/lib/control-auth';
import { getScaleCockpitData } from '@/lib/scale-cockpit/service';
import { buildReferralReport } from '@/lib/vendor/referrals/reporting';
export const dynamic = 'force-dynamic';

export default async function CommandReferralsPage() {
  await requireControlStaff();
  const data = await getScaleCockpitData();

  const rows = data.businesses.map((b) => ({
    businessId: b.businessId,
    businessName: b.businessName,
    referralSource: b.referralSource,
    referralStatus: b.referralStatus,
    assignedAgent: b.assignedAgent,
    isPaid: b.referralStatus === 'PAID' || b.billingAccessState === 'PAID_ACTIVE',
    inTrial: ['TRIAL_ACTIVE', 'TRIAL_DUE_SOON', 'TRIAL_DUE_TODAY'].includes(b.billingAccessState),
  }));

  const report = buildReferralReport(rows);

  return (
    <div className="space-y-6">
      <ControlPageHeader
        eyebrow="Commercial rollout"
        title="Referral performance"
        description="Leads by source and agent — demo, trial, and paid conversion at a glance."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs text-control-muted">With source recorded</p>
          <p className="text-2xl font-bold">{report.totals.withSource}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-control-muted">Demo booked+</p>
          <p className="text-2xl font-bold">{report.totals.demoBooked}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-control-muted">Trials</p>
          <p className="text-2xl font-bold">{report.totals.trials}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-control-muted">Paid</p>
          <p className="text-2xl font-bold">{report.totals.paid}</p>
        </div>
      </div>

      {(report.conversion.demoToTrialPct != null || report.conversion.trialToPaidPct != null) && (
        <div className="card p-4 text-sm text-control-muted">
          {report.conversion.demoToTrialPct != null ? (
            <span className="mr-4">Demo → trial: {report.conversion.demoToTrialPct}%</span>
          ) : null}
          {report.conversion.trialToPaidPct != null ? (
            <span>Trial → paid: {report.conversion.trialToPaidPct}%</span>
          ) : null}
        </div>
      )}

      <section className="card p-4">
        <h2 className="text-sm font-bold">Leads by source</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-control-muted border-b border-control-line">
                <th className="py-2 pr-2">Source</th>
                <th className="py-2 pr-2">Leads</th>
                <th className="py-2 pr-2">Demo+</th>
                <th className="py-2 pr-2">Trials</th>
                <th className="py-2">Paid</th>
              </tr>
            </thead>
            <tbody>
              {report.bySource.map((row) => (
                <tr key={row.source} className="border-b border-black/5">
                  <td className="py-2 pr-2 font-medium">{row.label}</td>
                  <td className="py-2 pr-2">{row.leads}</td>
                  <td className="py-2 pr-2">{row.demoBooked}</td>
                  <td className="py-2 pr-2">{row.trials}</td>
                  <td className="py-2">{row.paid}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-bold">Agent performance</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-control-muted border-b border-control-line">
                <th className="py-2 pr-2">Agent</th>
                <th className="py-2 pr-2">Leads</th>
                <th className="py-2 pr-2">Demos</th>
                <th className="py-2 pr-2">Trials</th>
                <th className="py-2 pr-2">Paid</th>
                <th className="py-2">Trial→paid</th>
              </tr>
            </thead>
            <tbody>
              {report.byAgent.map((row) => {
                const trialToPaid =
                  row.trials > 0 ? `${Math.round((row.paid / row.trials) * 100)}%` : '—';
                return (
                  <tr key={row.agent} className="border-b border-black/5">
                    <td className="py-2 pr-2 font-medium">{row.agent}</td>
                    <td className="py-2 pr-2">{row.total}</td>
                    <td className="py-2 pr-2">{row.demoBooked}</td>
                    <td className="py-2 pr-2">{row.trials}</td>
                    <td className="py-2 pr-2">{row.paid}</td>
                    <td className="py-2">{trialToPaid}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-sm">
        <Link href="/command/scale" className="font-semibold text-control-accent hover:underline">
          Open Scale Cockpit →
        </Link>{' '}
        to update source, status and follow-up per business.
      </p>
    </div>
  );
}
