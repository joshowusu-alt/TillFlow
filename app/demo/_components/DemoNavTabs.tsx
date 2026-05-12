'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/demo/dashboard',  label: 'Dashboard'   },
  { href: '/demo/pos',        label: 'POS View' },
  { href: '/demo/inventory',  label: 'Inventory'   },
  { href: '/demo/sales',      label: 'Sales'       },
  { href: '/demo/purchases',  label: 'Purchases'   },
  { href: '/demo/customers',  label: 'Customers'   },
  { href: '/demo/reports',    label: 'Reports'     },
];

export default function DemoNavTabs() {
  const pathname = usePathname();

  return (
    <div className="flex gap-0.5 overflow-x-auto px-4">
      {TABS.map(tab => {
        const active = pathname === tab.href || (pathname?.startsWith(tab.href + '/') ?? false);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={[
              'whitespace-nowrap rounded-t px-4 py-2.5 text-sm font-medium transition-colors',
              active
                ? 'bg-white text-accent border-x border-t border-black/10 -mb-px'
                : 'text-black/50 hover:text-black/80 hover:bg-white/50',
            ].join(' ')}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
