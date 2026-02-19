import PageHeader from '@/components/PageHeader';
import RefreshIndicator from '@/components/RefreshIndicator';
import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function SystemHealthPage() {
  const { business } = await requireBusiness(['OWNER', 'MANAGER']);
  if (!business) return <div className="card p-6">Unauthorized.</div>;

  const now = new Date();
  const last24h = new Date(now.getTime() - 86400000);
  const businessId = business.id;

  const [
    syncEvents24h,
    lastSyncEvent,
    errorAuditCount,
    recentJobs,
    messageLogs24h,
    lastBackup,
    openRiskAlerts,
    totalMessageLogs,
  ] = await Promise.all([
    prisma.syncEvent.count({ where: { businessId, appliedAt: { gte: last24h } } }),
    prisma.syncEvent.findFirst({
      where: { businessId },
      orderBy: { appliedAt: 'desc' },
      select: { appliedAt: true, eventType: true },
    }),
    prisma.auditLog.count({
      where: {
        businessId,
        createdAt: { gte: last24h },
        action: { in: ['ERROR', 'FRAUD_ALERT', 'RISK_ALERT', 'VOID', 'RETURN'] },
      },
    }),
    prisma.scheduledJob.findMany({
      where: { businessId },
      orderBy: { startedAt: 'desc' },
      take: 10,
      select: { id: true, jobName: true, status: true, startedAt: true, finishedAt: true, durationMs: true, triggeredBy: true, errorMessage: true },
    }),
    prisma.messageLog.count({ where: { businessId, sentAt: { gte: last24h } } }),
    prisma.dayClosure.findFirst({
      where: { businessId },
      orderBy: { closureDate: 'desc' },
      select: { closureDate: true, createdAt: true },
    }),
    prisma.riskAlert.count({ where: { businessId, status: 'OPEN' } }),
    prisma.messageLog.count({ where: { businessId } }),
  ]);

  const statusChip = (ok: boolean) => (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
      {ok ? 'OK' : 'Alert'}
    </span>
  );

  const jobStatusChip = (status: string) => {
    const colours: Record<string, string> = {
      SUCCESS: 'bg-emerald-100 text-emerald-700',
      ERROR: 'bg-rose-100 text-rose-700',
      SKIPPED: 'bg-gray-100 text-gray-600',
      RUNNING: 'bg-amber-100 text-amber-700',
    };
    return (
      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colours[status] ?? 'bg-gray-100 text-gray-600'}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Health"
        subtitle="Live operational metrics and scheduler status."
        actions={<RefreshIndicator fetchedAt={now.toISOString()} autoRefreshMs={30_000} />}
      />

      {/* Quick stats grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: 'Sync Events (24h)', value: syncEvents24h, ok: syncEvents24h < 1000 },
          { label: 'Risk Alerts (open)', value: openRiskAlerts, ok: openRiskAlerts === 0 },
          { label: 'Audit Flags (24h)', value: errorAuditCount, ok: errorAuditCount < 20 },
          { label: 'Messages Sent (24h)', value: messageLogs24h, ok: true },
        ].map((m) => (
          <div key={m.label} className="card p-4">
            <div className="mb-1 text-xs text-black/40">{m.label}</div>
            <div className="flex items-end justify-between">
              <span className="text-2xl font-bold">{m.value}</span>
              {statusChip(m.ok)}
            </div>
          </div>
        ))}
      </div>

      {/* Details row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-3 font-semibold text-sm">Observability</h3>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-black/5">
              <tr className="py-1">
                <td className="py-2 text-black/50 pr-4">Last Sync Event</td>
                <td className="py-2 font-medium">
                  {lastSyncEvent
                    ? `${lastSyncEvent.eventType} · ${new Date(lastSyncEvent.appliedAt).toLocaleString()}`
                    : '—'}
                </td>
              </tr>
              <tr>
                <td className="py-2 text-black/50 pr-4">Last Day Closure</td>
                <td className="py-2 font-medium">
                  {lastBackup
                    ? new Date(lastBackup.closureDate).toLocaleDateString()
                    : <span className="text-amber-600">No closure on record</span>}
                </td>
              </tr>
              <tr>
                <td className="py-2 text-black/50 pr-4">Total Messages Logged</td>
                <td className="py-2 font-medium">{totalMessageLogs}</td>
              </tr>
              <tr>
                <td className="py-2 text-black/50 pr-4">Open Risk Alerts</td>
                <td className="py-2 font-medium">
                  {openRiskAlerts === 0
                    ? <span className="text-emerald-600">None</span>
                    : <a href="/qa" className="text-rose-600 hover:underline">{openRiskAlerts} open →</a>}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card p-5">
          <h3 className="mb-3 font-semibold text-sm">API Endpoints</h3>
          <div className="space-y-2 text-sm">
            {[
              { label: 'Basic Health', url: '/api/health', hint: 'DB ping' },
              { label: 'Admin Health JSON', url: '/api/admin/health', hint: 'Full metrics' },
              { label: 'EOD Cron', url: '/api/cron/eod-summary', hint: 'Needs CRON_SECRET' },
              { label: 'Demo Reset', url: '/api/cron/demo-reset', hint: 'Needs CRON_SECRET' },
              { label: 'Offline Sync', url: '/api/offline/sync', hint: 'POST, device auth' },
            ].map((ep) => (
              <div key={ep.url} className="flex items-center justify-between rounded-lg border border-black/5 bg-black/[0.02] px-3 py-2">
                <div>
                  <span className="font-medium">{ep.label}</span>
                  <span className="ml-2 text-xs text-black/40">{ep.hint}</span>
                </div>
                <code className="text-xs text-black/50 font-mono">{ep.url}</code>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scheduler job history */}
      <div className="card p-6">
        <h3 className="mb-4 font-semibold text-sm">Scheduler Job History</h3>
        {recentJobs.length === 0 ? (
          <p className="text-sm text-black/40">No scheduler jobs recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {recentJobs.map((job) => (
              <div key={job.id} className="flex items-center justify-between rounded-xl border border-black/5 px-4 py-3 hover:bg-black/[0.02]">
                <div className="flex items-center gap-3">
                  {jobStatusChip(job.status)}
                  <div>
                    <div className="text-sm font-medium">{job.jobName.replace(/_/g, ' ')}</div>
                    <div className="text-xs text-black/40">via {job.triggeredBy}</div>
                  </div>
                </div>
                <div className="text-right text-xs text-black/40">
                  <div>{new Date(job.startedAt).toLocaleString()}</div>
                  {job.durationMs != null && <div>{job.durationMs}ms</div>}
                  {job.errorMessage && <div className="text-rose-500 truncate max-w-xs">{job.errorMessage}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
