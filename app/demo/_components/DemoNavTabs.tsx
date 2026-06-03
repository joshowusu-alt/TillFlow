'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/demo',           label: 'Start'      },
  { href: '/demo/dashboard', label: 'Dashboard'  },
  { href: '/demo/try-sale',  label: 'Try sale'   },
  { href: '/demo/inventory', label: 'Stock'      },
  { href: '/demo/sales',     label: 'Sales'      },
  { href: '/demo/reports',   label: 'Reports'    },
  { href: '/demo/store',     label: 'Online'     },
  { href: '/demo/orders',    label: 'Orders'     },
];

export default function DemoNavTabs() {
  const pathname = usePathname();

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-5 bg-gradient-to-r from-white to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-5 bg-gradient-to-l from-white to-transparent" />
      <div className="flex gap-1.5 overflow-x-auto px-3 py-2.5 scrollbar-none">
        {TABS.map((tab) => {
          const active = pathname === tab.href || (pathname?.startsWith(tab.href + '/') ?? false);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={[
                'inline-flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-all',
                active
                  ? 'bg-accent text-white shadow-md shadow-accent/20'
                  : 'border border-slate-200 bg-white text-slate-600 shadow-sm hover:border-accent/20 hover:text-accent',
              ].join(' ')}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
