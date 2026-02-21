'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/settings', label: 'Business', exact: true },
  { href: '/settings/organization', label: 'Organization' },
  { href: '/settings/notifications', label: 'Notifications' },
  { href: '/settings/system-health', label: 'System Health' },
  { href: '/settings/receipt-design', label: 'Receipt Design' },
  { href: '/settings/backup', label: 'Backup' },
];

export default function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1 border-b border-border pb-px mb-6 -mt-2">
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              active
                ? 'border-b-2 border-primary text-primary bg-primary/5'
                : 'text-muted hover:text-ink hover:bg-surface'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
