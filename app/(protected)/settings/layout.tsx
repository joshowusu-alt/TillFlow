import SettingsTabs from '@/components/SettingsTabs';
import { requireBusiness } from '@/lib/auth';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireBusiness(['MANAGER', 'OWNER']);

  return (
    <div>
      <SettingsTabs role={user.role as 'MANAGER' | 'OWNER'} />
      {children}
    </div>
  );
}
