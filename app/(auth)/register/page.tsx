import { getUser } from '@/lib/auth';
import RegisterForm from '@/components/RegisterForm';
import { buildTillflowPublicMetadata } from '@/lib/marketing/site';
import { redirect } from 'next/navigation';

export const metadata = buildTillflowPublicMetadata({
  title: 'Start Your TillFlow Trial',
  description:
    'Create your TillFlow account in minutes. Built for product-based businesses in Ghana — POS, stock, payments and owner reports.',
  canonicalPath: '/register',
});

export default async function RegisterPage({ searchParams }: { searchParams: { error?: string; mode?: string } }) {
  // If the user already has a valid session, send them to POS
  const user = await getUser();
  if (user) redirect('/pos');
  if (searchParams?.mode === 'demo') redirect('/demo');

  const error = searchParams?.error;

  return (
    <div>
      <RegisterForm error={error} />
    </div>
  );
}
