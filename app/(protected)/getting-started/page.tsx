import { requireUser } from '@/lib/auth';
import GettingStartedClient from './GettingStartedClient';

export default async function GettingStartedPage({
  searchParams,
}: {
  searchParams: { demo?: string };
}) {
  const user = await requireUser();
  const isDemo = searchParams?.demo === '1';

  return <GettingStartedClient userName={user.name} isDemo={isDemo} />;
}
