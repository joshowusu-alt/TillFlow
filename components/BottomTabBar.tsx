'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AppRole } from '@/lib/navigation-config';
import { getBottomTabsForRole } from '@/lib/navigation/mobile-menu-config';

/**
 * Custom DOM event used by the BottomTabBar's "More" tab to open the
 * mobile drawer living inside TopNav. Kept as a DOM event (rather than
 * a React context) because the bar and the top nav are siblings in the
 * layout tree; a context would require lifting state up to the layout,
 * which is a server component.
 */
export const OPEN_MOBILE_NAV_EVENT = 'tillflow:open-mobile-nav';

/** Routes that should NOT render the bottom tab bar. */
const HIDDEN_ROUTES = [
  '/pos',
  '/receipts',
  '/login',
  '/register',
  '/welcome',
  '/demo',
  '/offline',
];

const TAB_ICON_PROPS = {
  className: 'h-6 w-6',
  fill: 'none' as const,
  viewBox: '0 0 24 24',
  strokeWidth: 1.7,
  stroke: 'currentColor' as const,
};
const PATH_PROPS = {
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

type TabIconName =
  | 'home'
  | 'pos'
  | 'sales'
  | 'inventory'
  | 'reports'
  | 'purchases'
  | 'shift'
  | 'account'
  | 'help'
  | 'more';

function TabIcon({ name }: { name: TabIconName }) {
  switch (name) {
    case 'home':
      return (
        <svg {...TAB_ICON_PROPS}>
          <path
            {...PATH_PROPS}
            d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
          />
        </svg>
      );
    case 'pos':
      return (
        <svg {...TAB_ICON_PROPS}>
          <path
            {...PATH_PROPS}
            d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
          />
        </svg>
      );
    case 'sales':
      return (
        <svg {...TAB_ICON_PROPS}>
          <path
            {...PATH_PROPS}
            d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V19.5a2.25 2.25 0 002.25 2.25h.75m0-3.75h.008v.008H12V18z"
          />
        </svg>
      );
    case 'inventory':
      return (
        <svg {...TAB_ICON_PROPS}>
          <path
            {...PATH_PROPS}
            d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3"
          />
        </svg>
      );
    case 'reports':
      return (
        <svg {...TAB_ICON_PROPS}>
          <path
            {...PATH_PROPS}
            d="M4 5.5a1.5 1.5 0 011.5-1.5h5v7H4V5.5zM13.5 4h5A1.5 1.5 0 0120 5.5v4h-6.5V4zM4 13.5h6.5V20h-5A1.5 1.5 0 014 18.5v-5zM13.5 12H20v6.5a1.5 1.5 0 01-1.5 1.5h-5V12z"
          />
        </svg>
      );
    case 'purchases':
      return (
        <svg {...TAB_ICON_PROPS}>
          <path
            {...PATH_PROPS}
            d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"
          />
        </svg>
      );
    case 'shift':
      return (
        <svg {...TAB_ICON_PROPS}>
          <path {...PATH_PROPS} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'account':
      return (
        <svg {...TAB_ICON_PROPS}>
          <path
            {...PATH_PROPS}
            d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
          />
        </svg>
      );
    case 'help':
      return (
        <svg {...TAB_ICON_PROPS}>
          <path
            {...PATH_PROPS}
            d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
          />
        </svg>
      );
    case 'more':
      return (
        <svg {...TAB_ICON_PROPS}>
          <path {...PATH_PROPS} d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      );
  }
}

export default function BottomTabBar({ userRole }: { userRole: AppRole }) {
  const pathname = usePathname() ?? '';

  if (HIDDEN_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    return null;
  }

  const openMobileNav = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(OPEN_MOBILE_NAV_EVENT));
  };

  const tabs = getBottomTabsForRole(userRole);

  return (
    <nav
      aria-label="Primary mobile navigation"
      className="mobile-bottom-tab-bar fixed inset-x-0 z-40 border-t border-slate-200/80 bg-white/95 backdrop-blur-xl shadow-[0_-2px_14px_rgba(15,23,42,0.06)] keyboard-safe-fixed-bottom hide-when-keyboard-open lg:hidden"
    >
      <ul className="mx-auto flex max-w-screen-sm items-stretch justify-around gap-1 px-2 py-1.5">
        {tabs.map((tab) => {
          const active = tab.match ? tab.match(pathname) : false;
          const common =
            'flex h-14 min-w-[64px] flex-col items-center justify-center gap-0.5 rounded-xl px-3 transition-colors';
          const stateClasses = active
            ? 'text-accent font-semibold'
            : 'text-slate-600 hover:text-slate-900 active:bg-slate-100';

          const content = (
            <>
              <TabIcon name={tab.icon} />
              <span className="text-[10px] font-medium tracking-wide">{tab.label}</span>
            </>
          );

          return (
            <li key={tab.label} className="flex-1">
              {tab.opensMenu ? (
                <button type="button" onClick={openMobileNav} className={`${common} ${stateClasses} w-full`}>
                  {content}
                </button>
              ) : (
                <Link
                  href={tab.href!}
                  aria-current={active ? 'page' : undefined}
                  className={`${common} ${stateClasses}`}
                >
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
