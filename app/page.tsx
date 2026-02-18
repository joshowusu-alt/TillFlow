import { getUser } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function Home() {
  const user = await getUser();
  if (user) {
    redirect('/pos');
  }
  redirect('/welcome');
}
