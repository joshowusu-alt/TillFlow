import { getUser } from '@/lib/auth';
import RegisterForm from '@/components/RegisterForm';
import { redirect } from 'next/navigation';

export default async function RegisterPage({ searchParams }: { searchParams: { error?: string; mode?: string } }) {
  // If the user already has a valid session, send them to POS
  const user = await getUser();
  if (user) redirect('/pos');

  const error = searchParams?.error;
  const isDemo = searchParams?.mode === 'demo';

  return (
    <div>
      <RegisterForm isDemo={isDemo} error={error} />
    </div>
  );
}
