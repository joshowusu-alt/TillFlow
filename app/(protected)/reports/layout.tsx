import { requireBusiness } from '@/lib/auth';
import { recordOwnerReportView } from '@/app/actions/activation';
import { ReportReadOnlyBanner } from '@/components/reports/ReportSurfaceDenial';

const READ_ONLY_BILLING = new Set(['TRIAL_RESTRICTED', 'PAYMENT_RESTRICTED', 'READ_ONLY']);

export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  const { user, business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (user.role === 'OWNER') {
    await recordOwnerReportView();
  }
  const billing = String((business as { billingAccessState?: string }).billingAccessState ?? '');
  return (
    <>
      {READ_ONLY_BILLING.has(billing) ? <ReportReadOnlyBanner /> : null}
      {children}
    </>
  );
}
