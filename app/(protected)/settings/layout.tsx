import HashScroll from '@/components/HashScroll';
import SettingsTabs from '@/components/SettingsTabs';
import { requireBusiness } from '@/lib/auth';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireBusiness(['MANAGER', 'OWNER']);

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-8">
      <HashScroll offset={144} />
      <SettingsTabs role={user.role as 'MANAGER' | 'OWNER'} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
