'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useEffect, useMemo, useState } from 'react';

type ControlShellStaff = {
  name: string;
  email: string;
  role: string;
};

const navigation = [
  { href: '/', label: 'Portfolio', shortLabel: 'Home', icon: 'home' },
  { href: '/businesses', label: 'Businesses', shortLabel: 'Businesses', icon: 'grid' },
  { href: '/collections', label: 'Collections', shortLabel: 'Collections', icon: 'pulse' },
  { href: '/revenue', label: 'Revenue', shortLabel: 'Revenue', icon: 'chart' },
  { href: '/playbooks', label: 'Playbooks', shortLabel: 'Playbooks', icon: 'book' },
  { href: '/staff', label: 'Staff', shortLabel: 'Staff', icon: 'users' },
];

function isActivePath(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

function NavigationIcon({ icon, active }: { icon: string; active: boolean }) {
  const className = `h-[18px] w-[18px] ${active ? 'text-control-ink' : 'text-current'}`;

  switch (icon) {
    case 'grid':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="4" y="4" width="6" height="6" rx="1.2" />
          <rect x="14" y="4" width="6" height="6" rx="1.2" />
          <rect x="4" y="14" width="6" height="6" rx="1.2" />
          <rect x="14" y="14" width="6" height="6" rx="1.2" />
        </svg>
      );
    case 'pulse':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l2.4-4.5L14 17l2.2-5H21" />
        </svg>
      );
    case 'chart':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 19V9m7 10V5m7 14v-7" />
        </svg>
      );
    case 'book':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 5.5A2.5 2.5 0 0 1 8.5 3H20v17H8.5A2.5 2.5 0 0 0 6 22V5.5ZM6 5.5V20" />
        </svg>
      );
    case 'users':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 19a4 4 0 0 0-8 0" />
          <circle cx="12" cy="11" r="3" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 19a3.5 3.5 0 0 0-2.6-3.38M17.5 8.2A2.5 2.5 0 1 1 19 12.8" />
        </svg>
      );
    case 'home':
    default:
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 11.5 12 5l8 6.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 10.5V20h11V10.5" />
        </svg>
      );
  }
}

export default function ControlShell({ children, staff }: { children: ReactNode; staff: ControlShellStaff }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const currentSection = useMemo(
    () => navigation.find((item) => isActivePath(pathname, item.href)) ?? navigation[0],
    [pathname]
  );

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileMenuOpen]);

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1600px] gap-4 px-3 py-3 sm:gap-6 sm:px-6 sm:py-5 lg:px-8">
      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-[#122126]/45 backdrop-blur-[2px]"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-[22rem] flex-col border-l border-black/10 bg-[#122126] px-5 pb-[calc(var(--safe-bottom)+1.25rem)] pt-[calc(var(--safe-top)+1rem)] text-white shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">Internal only</div>
                <div className="mt-2 text-2xl font-semibold tracking-tight">Tish Group Control</div>
                <div className="mt-2 text-sm text-white/66">{staff.name} · {staff.role.replace(/_/g, ' ')}</div>
              </div>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMobileMenuOpen(false)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/12 bg-white/8 text-white transition hover:bg-white/12"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <nav className="mt-8 space-y-2">
              {navigation.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    className={`flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition ${
                      active ? 'bg-white text-control-ink' : 'bg-white/5 text-white/78 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <NavigationIcon icon={item.icon} active={active} />
                      <span>{item.label}</span>
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.18em]">Ops</span>
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/75">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">Signed in</div>
                <div className="mt-2 font-semibold text-white">{staff.name}</div>
                <div className="mt-1 text-xs text-white/60">{staff.email}</div>
              </div>

              <p className="leading-6">
                Tillflow enforces access. Tish Group Control manages subscription, collections, and relationship follow-up.
              </p>

              <Link
                href="/logout"
                className="inline-flex w-full items-center justify-center rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/12"
              >
                Sign out
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      <aside className="sticky top-5 hidden max-h-[calc(100dvh-2.5rem)] w-[280px] shrink-0 flex-col justify-between self-start rounded-panel border border-black/10 bg-[#122126] px-5 py-5 text-white shadow-dashboard lg:flex">
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
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  className={`flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition ${
                    active ? 'bg-white text-control-ink' : 'bg-white/5 text-white/78 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <NavigationIcon icon={item.icon} active={active} />
                    <span>{item.label}</span>
                  </span>
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

      <div className="flex min-w-0 flex-1 flex-col gap-4 pb-[calc(var(--safe-bottom)+1.5rem)] sm:gap-6 lg:pb-0">
        <div className="sticky top-0 z-30 lg:hidden">
          <div className="border-b border-[var(--line)] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
              <div className="min-w-0">
                <div className="eyebrow">Tish Group Control</div>
                <div className="mt-0.5 truncate text-[1.6rem] font-semibold leading-tight tracking-tight text-control-ink">{currentSection.label}</div>
              </div>
              <button
                type="button"
                aria-label="Open navigation"
                aria-expanded={mobileMenuOpen}
                onClick={() => setMobileMenuOpen(true)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/8 bg-white text-control-ink transition hover:bg-black/[0.03]"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </button>
            </div>

            <div className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-black/44">
              {staff.name} · {staff.role.replace(/_/g, ' ')}
            </div>

            <div className="mobile-nav-strip -mb-px flex overflow-x-auto px-2">
              {navigation.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    className={`shrink-0 border-b-2 px-3 pb-3 pt-1.5 text-sm font-medium transition ${
                      active
                        ? 'border-control-ink text-control-ink'
                        : 'border-transparent text-black/52 hover:text-control-ink'
                    }`}
                  >
                    {item.shortLabel}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}