import { WithheldReportNotice } from '@/components/reports/ReportsContextNav';
import { ReportReadOnlyBanner, ReportScopeLabel } from '@/components/reports/ReportSurfaceDenial';
import { openLiveReport } from '@/lib/entitlements/live-report';
import { formatBusinessLocalDateKey } from '@/lib/notifications/utils';

export default async function BalanceSheetPage({
  searchParams,
}: {
  searchParams?: { asOf?: string; storeId?: string; businessId?: string };
}) {
  const opened = await openLiveReport({
    surfaceId: 'balance_sheet',
    search: searchParams,
    range: ({ timezone, now }) => {
      const key = searchParams?.asOf?.trim() || formatBusinessLocalDateKey(now, timezone);
      return { fromLocalDate: key, toLocalDate: key, preset: 'CUSTOM' };
    },
  });
  if (!opened.ok) return opened.denial;

  return (
    <div className="space-y-4">
      {opened.readOnly ? <ReportReadOnlyBanner /> : null}
      {opened.branch.kind === 'label' ? <ReportScopeLabel label={opened.branch.label} /> : null}
      <WithheldReportNotice
        title="This statement is withheld"
        body="The balance sheet is hidden until it can be shown without moving an unexplained gap into inventory. No figures are shown."
      />
    </div>
  );
}
