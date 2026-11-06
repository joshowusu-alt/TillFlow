import '@/app/commercial-public.css';
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

export default async function RegisterPage(props: { searchParams: Promise<{ error?: string; mode?: string; plan?: string; billing?: string }> }) {
  const searchParams = await props.searchParams;
  // If the user already has a valid session, send them to POS
  const user = await getUser();
  if (user) redirect('/pos');
  if (searchParams?.mode === 'demo') redirect('/demo');

  const error = searchParams?.error;

  return (
    <div className="commercial-public">
      <RegisterForm error={error} initialPlan={searchParams.plan === 'GROWTH' || searchParams.plan === 'PRO' ? searchParams.plan : 'STARTER'} initialBillingInterval={searchParams.billing === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY'} />
    </div>
  );
}
