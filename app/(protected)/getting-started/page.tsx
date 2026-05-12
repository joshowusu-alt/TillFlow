import { requireUser } from '@/lib/auth';
import GettingStartedClient from './GettingStartedClient';

export default async function GettingStartedPage() {
  const user = await requireUser();

  return <GettingStartedClient userName={user.name} />;
}
