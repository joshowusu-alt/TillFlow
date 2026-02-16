import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default function Home() {
  const session = cookies().get('pos_session');
  if (session?.value) {
    redirect('/pos');
  }
  redirect('/welcome');
}
