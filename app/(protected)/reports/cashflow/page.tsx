import { WithheldReportNotice } from '@/components/reports/ReportsContextNav';
import { ReportReadOnlyBanner, ReportScopeLabel } from '@/components/reports/ReportSurfaceDenial';
import { openLiveReport } from '@/lib/entitlements/live-report';
import { formatBusinessLocalDateKey } from '@/lib/notifications/utils';
import { businessMonthWindow, requireReportTimeZone } from '@/lib/reports/reporting-clock';

export default async function CashflowPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string; storeId?: string; businessId?: string };
}) {
  const opened = await openLiveReport({
    surfaceId: 'cash_flow_statement',
    search: searchParams,
    range: ({ timezone, now }) => {
      if (searchParams?.from && searchParams?.to) {
        return { fromLocalDate: searchParams.from, toLocalDate: searchParams.to, preset: 'CUSTOM' };
      }
      const today = formatBusinessLocalDateKey(now, timezone);
      return { fromLocalDate: `${today.slice(0, 7)}-01`, toLocalDate: today, preset: 'MONTH_TO_DATE' };
    },
  });
  if (!opened.ok) return opened.denial;
  void businessMonthWindow(new Date(), requireReportTimeZone(opened.business.timezone));

  return (
    <div className="space-y-4">
      {opened.readOnly ? <ReportReadOnlyBanner /> : null}
      {opened.branch.kind === 'label' ? <ReportScopeLabel label={opened.branch.label} /> : null}
      <WithheldReportNotice
        title="This statement is not on the reliable list"
        body="Beginning cash is the till cash account plus legacy capital. Bank and Mobile Money balances are not in that figure. Net change in cash is operating cash, so ending cash will not match cash plus bank. This statement stays off the list until those labels and that formula are corrected. No cash-change total is shown."
      />
    </div>
  );
}
