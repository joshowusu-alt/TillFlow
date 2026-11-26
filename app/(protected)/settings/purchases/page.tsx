import { redirect } from 'next/navigation';
import { requireBusiness } from '@/lib/auth';
import { isFoodBusiness } from '@/lib/food/business';

export default async function PurchaseSettingsPage() {
  const { business } = await requireBusiness(['OWNER', 'MANAGER']);
  if (!business || !isFoodBusiness(business.businessCategory)) redirect('/settings');
  return <section className="card space-y-4 p-5">
    <h1 className="text-2xl font-semibold">Purchases</h1>
    <p>Purchase documents are optional.</p>
  </section>;
}
