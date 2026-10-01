import { headers } from 'next/headers';
import { requireBusiness } from '@/lib/auth';
import { recordOwnerReportView } from '@/app/actions/activation';
import { ReportsContextNav } from '@/lib/reports/today/context-nav';
import { ReportReadOnlyBanner } from '@/components/reports/ReportSurfaceDenial';

const READ_ONLY_BILLING = new Set(['TRIAL_RESTRICTED', 'PAYMENT_RESTRICTED', 'READ_ONLY']);

export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  const { user, business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (user.role === 'OWNER') {
    await recordOwnerReportView();
  }
  const billing = String((business as { billingAccessState?: string }).billingAccessState ?? '');
  const pathname = headers().get('x-pathname') || '';
  const todayOwnsRestrictedCopy = pathname === '/reports';
  return (
    <div data-reports-focus-scope className="min-w-0">
      {READ_ONLY_BILLING.has(billing) && !todayOwnsRestrictedCopy ? <ReportReadOnlyBanner /> : null}
      <ReportsContextNav businessId={business.id} />
      {children}
    </div>
  );
}
