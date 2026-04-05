'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SETTINGS_TAB_SECTIONS, type AppRole } from '@/lib/navigation-config';

export default function SettingsTabs({ role }: { role: AppRole }) {
  const pathname = usePathname();
  const visibleSections = SETTINGS_TAB_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.roles.includes(role)),
  })).filter((section) => section.items.length > 0);

  return (
    <div className="mb-6 -mt-2 space-y-4">
      {visibleSections.map((section) => (
        <nav key={section.id} className="border-b border-border pb-px" aria-label={section.label}>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-black/40">
            {section.label}
          </div>
          <div className="flex flex-wrap gap-1">
            {section.items.map((tab) => {
              const active = pathname === tab.href || pathname.startsWith(tab.href + '/');
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                    active
                      ? 'border-b-2 border-primary text-primary bg-primary/5'
                      : tab.advanced
                        ? 'text-black/55 hover:text-ink hover:bg-black/5'
                        : 'text-muted hover:text-ink hover:bg-surface'
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </nav>
      ))}
    </div>
  );
}
