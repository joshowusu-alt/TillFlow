import '@/app/commercial-public.css';
import { buildTillflowPublicMetadata } from '@/lib/marketing/site';

export const metadata = buildTillflowPublicMetadata({
  canonicalPath: '/welcome',
});

export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return <div className="commercial-public">{children}</div>;
}
