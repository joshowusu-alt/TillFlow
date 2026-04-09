import { redirect } from 'next/navigation';
import { requireBusiness } from '@/lib/auth';
import { getFeatures } from '@/lib/features';

export const dynamic = 'force-dynamic';

export default async function CommandCenterPage() {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  const features = getFeatures((business as any).plan ?? (business.mode as any), (business as any).storeMode as any);

  if (features.ownerIntelligence) {
    redirect('/reports/owner');
  }

  if (features.riskMonitor) {
    redirect('/reports/risk-monitor');
  }

  redirect('/reports/dashboard');
}
