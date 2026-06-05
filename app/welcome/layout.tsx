import { buildTillflowPublicMetadata } from '@/lib/marketing/site';

export const metadata = buildTillflowPublicMetadata({
  canonicalPath: '/welcome',
});

export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
