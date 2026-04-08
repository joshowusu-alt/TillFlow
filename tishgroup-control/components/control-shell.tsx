'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

type ControlShellStaff = {
  name: string;
  email: string;
  role: string;
};

const navigation = [
  { href: '/', label: 'Portfolio' },
  { href: '/businesses', label: 'Businesses' },
  { href: '/staff', label: 'Staff' },
  { href: '/collections', label: 'Collections' },
  { href: '/revenue', label: 'Revenue' },
  { href: '/playbooks', label: 'Playbooks' },
];

export default function ControlShell({ children, staff }: { children: ReactNode; staff: ControlShellStaff }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1600px] gap-6 px-4 py-5 sm:px-6 lg:px-8">
      <aside className="hidden w-[280px] shrink-0 flex-col justify-between rounded-panel border border-black/10 bg-[#122126] px-5 py-5 text-white shadow-dashboard lg:flex">
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">Internal only</div>
            <div className="text-2xl font-semibold tracking-tight">Tish Group Control</div>
            <p className="text-sm leading-6 text-white/68">
              Commercial portfolio, collections, support risk, and revenue visibility across every managed Tillflow business.
            </p>
          </div>

          <nav className="space-y-2">
            {navigation.map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition ${
                    active ? 'bg-white text-control-ink' : 'bg-white/5 text-white/78 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span>{item.label}</span>
                  <span className="text-[10px] uppercase tracking-[0.18em]">Ops</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/75">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">Signed in</div>
            <div className="mt-2 font-semibold text-white">{staff.name}</div>
            <div className="mt-1 text-xs text-white/60">{staff.email}</div>
            <div className="mt-2 inline-flex rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/72">
              {staff.role.replace(/_/g, ' ')}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">Operating stance</div>
            <p className="mt-2 leading-6">
              Tillflow enforces access. Tish Group Control manages the portfolio, billing decisions, and relationship follow-up.
            </p>
          </div>

          <Link
            href="/logout"
            className="inline-flex w-full items-center justify-center rounded-2xl border border-white/12 bg-white/8 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/12"
          >
            Sign out
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-6">{children}</div>
    </div>
  );
}