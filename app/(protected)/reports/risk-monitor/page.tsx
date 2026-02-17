import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import { formatDateTime, formatMoney } from '@/lib/format';

function parseDate(value: string | undefined, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed;
}

function severityClass(severity: string) {
  if (severity === 'HIGH') return 'bg-rose-100 text-rose-700';
  if (severity === 'LOW') return 'bg-emerald-100 text-emerald-700';
  return 'bg-amber-100 text-amber-700';
}

const alertTypeLabels: Record<string, string> = {
  FREQUENT_VOIDS: 'Frequent Voids',
  EXCESSIVE_DISCOUNT: 'Excessive Discount',
  NEGATIVE_MARGIN_SALE: 'Negative Margin Sale',
  LARGE_INVENTORY_ADJUSTMENT: 'Large Inventory Adjustment',
  CASH_VARIANCE_FREQUENCY: 'Cash Variance Frequency',
};

export default async function RiskMonitorPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string; storeId?: string; status?: string };
}) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);

  const from = parseDate(searchParams?.from, weekAgo);
  const to = parseDate(searchParams?.to, today);
  to.setHours(23, 59, 59, 999);
  const storeId = searchParams?.storeId || 'ALL';
  const status = searchParams?.status || 'OPEN';

  const alertWhere: any = {
    businessId: business.id,
    occurredAt: { gte: from, lte: to },
  };
  if (storeId !== 'ALL') {
    alertWhere.storeId = storeId;
  }
  if (status !== 'ALL') {
    alertWhere.status = status;
  }

  const [stores, alerts, discountedSales] = await Promise.all([
    prisma.store.findMany({
      where: { businessId: business.id },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.riskAlert.findMany({
      where: alertWhere,
      include: {
        store: { select: { name: true } },
        cashierUser: { select: { id: true, name: true } },
      },
      orderBy: { occurredAt: 'desc' },
      take: 500,
    }),
    prisma.salesInvoice.findMany({
      where: {
        businessId: business.id,
        createdAt: { gte: from, lte: to },
        ...(storeId !== 'ALL' ? { storeId } : {}),
        OR: [
          { discountPence: { gt: 0 } },
          { discountApprovedByUserId: { not: null } },
        ],
      },
      select: {
        cashierUserId: true,
        discountPence: true,
        discountApprovedByUserId: true,
      },
    }),
  ]);

  const byCashier = new Map<
    string,
    {
      name: string;
      alertCount: number;
      highAlertCount: number;
      discountTotalPence: number;
      overrideCount: number;
    }
  >();

  for (const alert of alerts) {
    const key = alert.cashierUserId ?? 'unknown';
    const entry = byCashier.get(key) ?? {
      name: alert.cashierUser?.name ?? 'Unknown',
      alertCount: 0,
      highAlertCount: 0,
      discountTotalPence: 0,
      overrideCount: 0,
    };
    entry.alertCount += 1;
    if (alert.severity === 'HIGH') entry.highAlertCount += 1;
    byCashier.set(key, entry);
  }

  for (const sale of discountedSales) {
    const key = sale.cashierUserId;
    const entry = byCashier.get(key) ?? {
      name: 'Unknown',
      alertCount: 0,
      highAlertCount: 0,
      discountTotalPence: 0,
      overrideCount: 0,
    };
    entry.discountTotalPence += sale.discountPence;
    if (sale.discountApprovedByUserId) {
      entry.overrideCount += 1;
    }
    byCashier.set(key, entry);
  }

  const cashierRows = Array.from(byCashier.entries())
    .map(([cashierUserId, stats]) => ({ cashierUserId, ...stats }))
    .sort((a, b) => {
      if (b.alertCount !== a.alertCount) return b.alertCount - a.alertCount;
      return b.overrideCount - a.overrideCount;
    })
    .slice(0, 20);

  const typeCounts = alerts.reduce<Record<string, number>>((acc, alert) => {
    acc[alert.alertType] = (acc[alert.alertType] ?? 0) + 1;
    return acc;
  }, {});

  const fromIso = from.toISOString().slice(0, 10);
  const toIso = to.toISOString().slice(0, 10);
  const highCount = alerts.filter((alert) => alert.severity === 'HIGH').length;
  const openCount = alerts.filter((alert) => alert.status === 'OPEN').length;
  const totalOverrides = discountedSales.filter((sale) => !!sale.discountApprovedByUserId).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Risk Monitor"
        subtitle="Anti-fraud alerts and cashier trends."
        actions={
          <Link
            href={`/exports/risk-summary?from=${fromIso}&to=${toIso}&storeId=${storeId}&status=${status}`}
            className="btn-secondary text-xs"
          >
            Export Summary CSV
          </Link>
        }
      />

      <form className="card grid gap-3 p-4 sm:grid-cols-5" method="GET">
        <div>
          <label className="label">From</label>
          <input className="input" type="date" name="from" defaultValue={fromIso} />
        </div>
        <div>
          <label className="label">To</label>
          <input className="input" type="date" name="to" defaultValue={toIso} />
        </div>
        <div>
          <label className="label">Branch / Store</label>
          <select className="input" name="storeId" defaultValue={storeId}>
            <option value="ALL">All branches</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input" name="status" defaultValue={status}>
            <option value="OPEN">Open only</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="ALL">All statuses</option>
          </select>
        </div>
        <div className="flex items-end">
          <button className="btn-primary w-full" type="submit">
            Apply
          </button>
        </div>
      </form>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="card p-4">
          <div className="text-xs text-black/50">Alerts in Range</div>
          <div className="text-2xl font-semibold">{alerts.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-black/50">Open Alerts</div>
          <div className="text-2xl font-semibold">{openCount}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-black/50">High Severity</div>
          <div className="text-2xl font-semibold text-rose">{highCount}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-black/50">Discount Overrides</div>
          <div className="text-2xl font-semibold">{totalOverrides}</div>
        </div>
      </div>

      <div className="card p-4">
        <h2 className="text-lg font-display font-semibold">Alert Types</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(typeCounts).map(([type, count]) => (
            <div key={type} className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm">
              <div className="text-black/60">{alertTypeLabels[type] ?? type}</div>
              <div className="text-lg font-semibold">{count}</div>
            </div>
          ))}
          {Object.keys(typeCounts).length === 0 ? (
            <div className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-black/50">
              No alerts in this date range.
            </div>
          ) : null}
        </div>
      </div>

      <div className="card overflow-x-auto p-4">
        <h2 className="text-lg font-display font-semibold">Cashier Trends</h2>
        <table className="table mt-3 w-full border-separate border-spacing-y-2">
          <thead>
            <tr>
              <th>Cashier</th>
              <th>Alerts</th>
              <th>High Alerts</th>
              <th>Discount Total</th>
              <th>Overrides</th>
            </tr>
          </thead>
          <tbody>
            {cashierRows.map((row) => (
              <tr key={row.cashierUserId} className="rounded-xl bg-white">
                <td className="px-3 py-3 text-sm">{row.name}</td>
                <td className="px-3 py-3 text-sm font-semibold">{row.alertCount}</td>
                <td className="px-3 py-3 text-sm font-semibold text-rose">{row.highAlertCount}</td>
                <td className="px-3 py-3 text-sm">{formatMoney(row.discountTotalPence, business.currency)}</td>
                <td className="px-3 py-3 text-sm">{row.overrideCount}</td>
              </tr>
            ))}
            {cashierRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-black/50">
                  No cashier trend data found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto p-4">
        <h2 className="text-lg font-display font-semibold">Recent Alerts</h2>
        <table className="table mt-3 w-full border-separate border-spacing-y-2">
          <thead>
            <tr>
              <th>Time</th>
              <th>Type</th>
              <th>Severity</th>
              <th>Cashier</th>
              <th>Branch</th>
              <th>Status</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert) => (
              <tr key={alert.id} className="rounded-xl bg-white">
                <td className="px-3 py-3 text-xs">{formatDateTime(alert.occurredAt)}</td>
                <td className="px-3 py-3 text-sm">{alertTypeLabels[alert.alertType] ?? alert.alertType}</td>
                <td className="px-3 py-3 text-sm">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${severityClass(alert.severity)}`}>
                    {alert.severity}
                  </span>
                </td>
                <td className="px-3 py-3 text-sm">{alert.cashierUser?.name ?? 'Unknown'}</td>
                <td className="px-3 py-3 text-sm">{alert.store?.name ?? 'N/A'}</td>
                <td className="px-3 py-3 text-xs">{alert.status}</td>
                <td className="px-3 py-3 text-sm">{alert.summary}</td>
              </tr>
            ))}
            {alerts.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-black/50">
                  No alerts found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
