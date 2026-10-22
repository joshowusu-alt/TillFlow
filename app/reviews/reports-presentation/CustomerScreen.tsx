'use client';

import type { ReactNode } from 'react';
import { ReportsCompactSetupBanner } from '@/components/reports/ReportsCompactBanners';

const TABS = ['Home', 'Sales', 'Inventory', 'Reports', 'More'];

export function CustomerScreen({
  label,
  banner,
  children,
}: {
  label: string;
  banner: boolean;
  children: ReactNode;
}) {
  return (
    <section
      data-customer-screen=""
      data-screen-label={label}
      className="relative bg-[#F8FBFF] pb-[var(--mobile-bottom-nav-height)] lg:pb-8"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('a')) event.preventDefault();
      }}
    >
      <div
        data-shell-header=""
        className="flex h-[var(--app-header-height-mobile)] items-center border-b border-slate-200 bg-white px-4"
      >
        <span className="font-display text-lg font-semibold text-accent">TillFlow</span>
      </div>
      {banner ? (
        <div
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('a')) event.preventDefault();
          }}
        >
          <ReportsCompactSetupBanner
            title="Finish setup"
            detail="A few business details are still open."
            cta="Continue"
          />
        </div>
      ) : null}
      <div
        data-shell-main=""
        data-reports-focus-scope=""
        className="app-main-shell w-full min-w-0 px-4 pt-1 sm:px-5 sm:pt-2 lg:px-6 lg:pt-4"
      >
        {children}
      </div>
    </section>
  );
}

export function ShellBottomNav() {
  return (
    <div
      data-shell-bottom=""
      aria-hidden="true"
      className="mobile-bottom-tab-bar pointer-events-none fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white lg:hidden"
    >
      <ul className="mx-auto flex max-w-screen-sm items-stretch justify-around px-2 py-1.5">
        {TABS.map((label) => (
          <li key={label} className="flex h-14 flex-1 items-center justify-center text-[10px] font-medium text-slate-600">
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function stayOnReview(event: { preventDefault: () => void }) {
  event.preventDefault();
}
