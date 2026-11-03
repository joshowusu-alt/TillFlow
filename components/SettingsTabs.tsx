'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SETTINGS_TAB_SECTIONS, type AppRole } from '@/lib/navigation-config';
export default function SettingsTabs({ role }: { role: AppRole }) {
  const pathname = usePathname() ?? '';
  const sections = SETTINGS_TAB_SECTIONS.map(section => ({ ...section, items: section.items.filter(item => item.roles.includes(role)) })).filter(section => section.items.length);
  const active = (href: string) => pathname === href || (href !== '/settings' && pathname.startsWith(href + '/'));
  const current = sections.flatMap(section => section.items).find(item => active(item.href));
  const navigation = (
      <nav aria-label="Settings" className="space-y-5 p-3 lg:p-0">
        {sections.map(section => <div key={section.id}>
          <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted">{section.label}</h2>
          <ul className="space-y-1">{section.items.map(tab => <li key={tab.href}>
            <Link href={tab.href} aria-current={active(tab.href) ? 'page' : undefined} className={
              'flex min-h-11 items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ' + (active(tab.href) ? 'bg-primary/10 font-semibold text-primary' : 'text-muted hover:bg-black/5 hover:text-ink')
            }>{tab.label}{tab.minimumPlan && <span className="rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-semibold text-muted">{tab.minimumPlan === 'PRO' ? 'Pro' : 'Growth'}</span>}</Link>
          </li>)}</ul>
        </div>)}
      </nav>
  );
  return <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
    <div className="hidden lg:block">{navigation}</div>
    <details key={pathname} className="settings-menu group rounded-2xl border border-border bg-white lg:hidden">
      <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 p-4 text-sm font-semibold lg:hidden">
        <span><span className="font-normal text-muted">Settings / </span>{current?.label ?? 'Browse settings'}</span>
        <span className="text-xs text-primary group-open:hidden">Browse</span><span className="hidden text-xs text-primary group-open:inline">Close</span>
      </summary>
      {navigation}

    </details>
  </aside>;
}
