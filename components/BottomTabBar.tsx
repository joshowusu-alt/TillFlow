'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

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
  '/pos',        // sticky complete-sale button + summary sidebar
  '/receipts',   // full-screen receipt preview
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

type TabIcon = 'home' | 'pos' | 'shift' | 'more';

function TabIcon({ name }: { name: TabIcon }) {
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
    case 'shift':
      return (
        <svg {...TAB_ICON_PROPS}>
          <path
            {...PATH_PROPS}
            d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    case 'more':
      return (
        <svg {...TAB_ICON_PROPS}>
          <path
            {...PATH_PROPS}
            d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
          />
        </svg>
      );
  }
}

type Tab = {
  label: string;
  icon: TabIcon;
  href?: string;
  onClick?: () => void;
  match?: (pathname: string) => boolean;
};

export default function BottomTabBar() {
  const pathname = usePathname() ?? '';

  // Hide on routes that own the bottom of the screen themselves.
  if (HIDDEN_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    return null;
  }

  const openMobileNav = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(OPEN_MOBILE_NAV_EVENT));
  };

  const tabs: Tab[] = [
    {
      label: 'Home',
      icon: 'home',
      href: '/onboarding',
      match: (p) => p === '/onboarding' || p === '/',
    },
    {
      label: 'POS',
      icon: 'pos',
      href: '/pos',
      match: (p) => p.startsWith('/pos'),
    },
    {
      label: 'Shifts',
      icon: 'shift',
      href: '/shifts',
      match: (p) => p.startsWith('/shifts'),
    },
    {
      label: 'More',
      icon: 'more',
      onClick: openMobileNav,
    },
  ];

  return (
    <nav
      aria-label="Primary mobile navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 backdrop-blur-xl shadow-[0_-2px_14px_rgba(15,23,42,0.06)] lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
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
              {tab.href ? (
                <Link
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={`${common} ${stateClasses}`}
                >
                  {content}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={tab.onClick}
                  className={`${common} ${stateClasses} w-full`}
                >
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
