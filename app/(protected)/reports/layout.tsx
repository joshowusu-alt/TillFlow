import { requireBusiness } from '@/lib/auth';
import { recordOwnerReportView } from '@/app/actions/activation';

export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireBusiness(['MANAGER', 'OWNER']);
  if (user.role === 'OWNER') {
    await recordOwnerReportView();
  }
  return children;
}
