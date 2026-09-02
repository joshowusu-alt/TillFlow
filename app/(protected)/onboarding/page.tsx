import { requireUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import OwnerReadinessContent from './OwnerReadinessContent';

export default async function OnboardingPage() {
  const user = await requireUser();
  // Cashiers and managers go straight to the POS — this page is owner-only
  if (user.role !== 'OWNER') redirect('/pos');

  return <OwnerReadinessContent />;
}
