import { redirect } from 'next/navigation';
import { openLiveReport } from '@/lib/entitlements/live-report';

/** Legacy path — sales reporting lives on the trading report after the view gate. */
export default async function ReportsSalesRedirectPage({
  searchParams,
}: {
  searchParams?: { storeId?: string; businessId?: string };
}) {
  const opened = await openLiveReport({
    surfaceId: 'legacy_reports_sales_redirect',
    search: searchParams,
  });
  if (!opened.ok) return opened.denial;
  redirect('/reports/dashboard');
}
