import { requireUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import OwnerReadinessContent from '../onboarding/OwnerReadinessContent';

export default async function HomePage() {
  const user = await requireUser();
  if (user.role !== 'OWNER') redirect('/pos');
  return <OwnerReadinessContent destination="home" />;
}
