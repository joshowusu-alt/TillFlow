import { notFound } from 'next/navigation';
import { WithheldReportNotice } from '@/components/reports/ReportsContextNav';
import { ReportScopeLabel } from '@/components/reports/ReportSurfaceDenial';
import { openLiveReport } from '@/lib/entitlements/live-report';

export const dynamic = 'force-dynamic';

export default async function CashflowForecastPage({
  searchParams,
}: {
  searchParams?: { days?: string; scenario?: string; storeId?: string; businessId?: string };
}) {
  const opened = await openLiveReport({
    surfaceId: 'cashflow_forecast',
    search: searchParams,
  });
  if (!opened.ok) return opened.denial;
  if (opened.branch.kind !== 'label') notFound();

  return (
    <div className="space-y-4">
      <ReportScopeLabel label={opened.branch.label} />
      <WithheldReportNotice
        title="This estimate is withheld"
        body="The cash-flow forecast is hidden until its figures are reliable. No values are shown."
      />
    </div>
  );
}
