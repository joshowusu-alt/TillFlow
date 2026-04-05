import PageHeader from '@/components/PageHeader';
import RefreshIndicator from '@/components/RefreshIndicator';
import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatMoney } from '@/lib/format';
import { getCatalogSanitySnapshot } from '@/lib/services/products';
import Link from 'next/link';

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
    catalogSanity,
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
    getCatalogSanitySnapshot(businessId),
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
          { label: 'Message Logs (24h)', value: messageLogs24h, ok: true },
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

      <div className="card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="font-semibold text-sm">Operator actions</h3>
            <p className="mt-1 text-sm text-black/50">
              Use these links when a problem needs action, not just observation.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/offline/sales" className="btn-secondary text-xs">Pending Offline Sales</Link>
            <Link href="/settings/backup" className="btn-secondary text-xs">Backup & Restore</Link>
            <Link href="/settings/data-repair" className="btn-secondary text-xs">Advanced Recovery</Link>
            <Link href="/reports/risk-monitor" className="btn-secondary text-xs">Risk Monitor</Link>
          </div>
        </div>
      </div>

      {/* Details row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="card p-4 sm:p-5">
          <h3 className="mb-3 font-semibold text-sm">Observability</h3>
          <div className="space-y-3 text-sm">
            <div className="rounded-xl border border-black/5 bg-black/[0.02] px-4 py-3">
              <div className="text-xs uppercase tracking-[0.16em] text-black/40">Last sync event</div>
              <div className="mt-1 font-medium text-ink">
                {lastSyncEvent
                  ? `${lastSyncEvent.eventType} · ${new Date(lastSyncEvent.appliedAt).toLocaleString()}`
                  : '—'}
              </div>
            </div>
            <div className="rounded-xl border border-black/5 bg-black/[0.02] px-4 py-3">
              <div className="text-xs uppercase tracking-[0.16em] text-black/40">Last day closure</div>
              <div className="mt-1 font-medium text-ink">
                {lastBackup
                  ? new Date(lastBackup.closureDate).toLocaleDateString()
                  : <span className="text-amber-600">No closure on record</span>}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-black/5 bg-black/[0.02] px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-black/40">Total messages logged</div>
                <div className="mt-1 font-medium text-ink">{totalMessageLogs}</div>
              </div>
              <div className="rounded-xl border border-black/5 bg-black/[0.02] px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-black/40">Open risk alerts</div>
                <div className="mt-1 font-medium text-ink">
                  {openRiskAlerts === 0
                    ? <span className="text-emerald-600">None</span>
                    : <a href="/reports/risk-monitor" className="text-rose-600 hover:underline">{openRiskAlerts} open →</a>}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card p-4 sm:p-5">
          <h3 className="mb-3 font-semibold text-sm">API Endpoints</h3>
          <div className="space-y-2 text-sm">
            {[
              { label: 'Basic Health', url: '/api/health', hint: 'DB ping' },
              { label: 'Admin Health JSON', url: '/api/admin/health', hint: 'Full metrics' },
              { label: 'EOD Cron', url: '/api/cron/eod-summary', hint: 'Needs CRON_SECRET' },
              { label: 'Demo Reset', url: '/api/cron/demo-reset', hint: 'Needs CRON_SECRET' },
              { label: 'Offline Sync', url: '/api/offline/sync', hint: 'POST, device auth' },
            ].map((ep) => (
              <div key={ep.url} className="flex flex-col gap-2 rounded-lg border border-black/5 bg-black/[0.02] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
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

      <div className="card p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="font-semibold text-sm">Catalog Trust Checks</h3>
            <p className="mt-1 text-sm text-black/50">
              Catch suspicious supermarket product data before it breaks cashier confidence.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className={`rounded-full px-2.5 py-1 ${catalogSanity.blockingCount === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
              {catalogSanity.blockingCount} blocking
            </span>
            <span className={`rounded-full px-2.5 py-1 ${catalogSanity.warningCount === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {catalogSanity.warningCount} warning
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {catalogSanity.checks.map((check) => (
            <div key={check.key} className="rounded-xl border border-black/5 bg-black/[0.02] px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="text-xs uppercase tracking-[0.16em] text-black/40">{check.label}</div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${check.severity === 'blocking' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                  {check.severity}
                </span>
              </div>
              <div className="mt-2 text-2xl font-bold text-ink">{check.count}</div>
              <p className="mt-2 text-xs text-black/50">{check.helper}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/products" className="btn-secondary text-xs">Review Products</Link>
          <Link href="/settings/data-repair" className="btn-secondary text-xs">Open Data Repair</Link>
        </div>

        {catalogSanity.rows.length > 0 ? (
          <div className="mt-5 overflow-x-auto">
            <table className="table w-full border-separate border-spacing-y-2">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Price</th>
                  <th>Cost</th>
                  <th>Barcode</th>
                  <th>Issues</th>
                </tr>
              </thead>
              <tbody>
                {catalogSanity.rows.map((row) => (
                  <tr key={row.id} className="rounded-xl bg-white">
                    <td className="px-3 py-3 font-semibold">
                      <Link href={`/products/${row.id}`} className="hover:underline">
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-sm">{formatMoney(row.sellingPriceBasePence, business.currency)}</td>
                    <td className="px-3 py-3 text-sm">{formatMoney(row.defaultCostBasePence, business.currency)}</td>
                    <td className="px-3 py-3 text-sm text-black/60">{row.barcode?.trim() || '—'}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {row.reasons.map((reason) => (
                          <span key={reason} className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
                            {reason}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            No suspicious product catalog issues were found in the active supermarket dataset.
          </div>
        )}
      </div>

      {/* Scheduler job history */}
      <div className="card p-4 sm:p-6">
        <h3 className="mb-4 font-semibold text-sm">Scheduler Job History</h3>
        {recentJobs.length === 0 ? (
          <p className="text-sm text-black/40">No scheduler jobs recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {recentJobs.map((job) => (
              <div key={job.id} className="flex flex-col gap-3 rounded-xl border border-black/5 px-4 py-3 hover:bg-black/[0.02] sm:flex-row sm:items-center sm:justify-between">
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
