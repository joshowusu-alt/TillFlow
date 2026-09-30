import { requireBusiness } from '@/lib/auth';
import { ReportsContextNav } from '@/lib/reports/today/context-nav';

export default async function StorefrontAnalyticsLayout({ children }: { children: React.ReactNode }) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  return (
    <>
      <ReportsContextNav businessId={business.id} />
      {children}
    </>
  );
}
