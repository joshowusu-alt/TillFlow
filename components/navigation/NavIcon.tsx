import type { NavIconKey } from '@/lib/navigation-config';

type NavIconProps = {
  iconKey?: NavIconKey;
  className?: string;
};

type IconPath = {
  d: string;
  fill?: boolean;
};

const ICON_PATHS: Record<NavIconKey | 'fallback', IconPath[]> = {
  pos: [{ d: 'M3.75 4.5h16.5v15H3.75zM7.5 9h9M7.5 12h9M7.5 15h4.5' }],
  sales: [{ d: 'M8 4.75h8M8 9h8M8 13.25h5M6 20h12a2 2 0 0 0 2-2V3.75H4V18a2 2 0 0 0 2 2z' }],
  orders: [{ d: 'M6 6h15l-1.5 8.5H8L6 3H3M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM18 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z' }],
  shifts: [{ d: 'M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z' }],
  inventory: [{ d: 'M12 3 3.75 7.5 12 12l8.25-4.5L12 3zM3.75 12 12 16.5l8.25-4.5M3.75 16.5 12 21l8.25-4.5' }],
  stockAdjustments: [{ d: 'M7 4v13M7 4 4 7M7 4l3 3M17 20V7M17 20l-3-3M17 20l3-3' }],
  stockMovements: [{ d: 'M4 7h14l-3-3M20 17H6l3 3M18 4v6M6 14v6' }],
  purchases: [{ d: 'M3.75 6.5h12.5l2.25 5H6l-2.25-5zM6 11.5v5h12.5v-5M8 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z' }],
  transfers: [{ d: 'M7.5 7.5H21m0 0-4-4m4 4-4 4M16.5 16.5H3m0 0 4 4m-4-4 4-4' }],
  products: [{ d: 'M12 3 20.25 7.5v9L12 21 3.75 16.5v-9L12 3zM12 12l8.25-4.5M12 12 3.75 7.5M12 12v9' }],
  labels: [{ d: 'M4 5.5A1.5 1.5 0 0 1 5.5 4h6.25l8.25 8.25a2 2 0 0 1 0 2.83L15.08 20a2 2 0 0 1-2.83 0L4 11.75V5.5zM7.5 7.5h.01' }],
  expenses: [{ d: 'M3 7h18v12H3zM3 10h18M7 15h5' }],
  payments: [{ d: 'M4 7.5h16v9H4zM7 12h.01M11 12h6M8 16.5v2M16 16.5v2' }],
  supplierAging: [{ d: 'M7 3v3M17 3v3M4.5 8.5h15M6 5h12a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 18 20H6a1.5 1.5 0 0 1-1.5-1.5v-12A1.5 1.5 0 0 1 6 5zM8 13h4M8 16h8' }],
  reconciliation: [{ d: 'M8 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 9h6M9 13h3M15.5 15.5l-2 2-1-1' }],
  people: [{ d: 'M16 19a4 4 0 0 0-8 0M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 18a3 3 0 0 0-2.25-2.9M17 7.5a2.5 2.5 0 0 1 0 5' }],
  customers: [{ d: 'M15.5 19a5.5 5.5 0 0 0-11 0M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM17 8h4M19 6v4' }],
  suppliers: [{ d: 'M4 10.5V20h16v-9.5M4 10.5 5.5 4h13l1.5 6.5M4 10.5h16M8 20v-5h4v5M15 14h2' }],
  reports: [{ d: 'M4 19V5M4 19h16M8 15v-4M12 15V7M16 15v-6' }],
  analytics: [{ d: 'M3 17l5-5 4 4 7-8M15 8h4v4' }],
  profit: [{ d: 'M4 19h16M6 16V9M12 16V5M18 16v-7M8 7l4-4 4 4' }],
  supplierSales: [{ d: 'M4 8h16M6 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2M7 12h10M7 16h6M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8' }],
  reorder: [{ d: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01' }],
  incomeStatement: [{ d: 'M7 3.75h7l3 3V20.25H7zM14 3.75V7h3M9 11h6M9 14h6M9 17h3' }],
  balanceSheet: [{ d: 'M12 3v18M5 6h14M6 6l-3 7h6L6 6zM18 6l-3 7h6l-3-7zM8 21h8' }],
  cashFlow: [{ d: 'M4 8h12l-3-3M20 16H8l3 3M5 13h14' }],
  cashDrawer: [{ d: 'M4 8h16v11H4zM4 12h16M9 15h6M8 5h8v3' }],
  risk: [{ d: 'M12 4 21 20H3L12 4zM12 10v4M12 17h.01' }],
  audit: [{ d: 'M8 4h8M9 4a3 3 0 0 1 6 0M6 7h12v13H6zM9 13l2 2 4-5' }],
  exports: [{ d: 'M12 4v10M12 14l4-4M12 14l-4-4M5 16v3h14v-3' }],
  ownerBrief: [{ d: 'M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z' }],
  forecast: [{ d: 'M4 18l5-5 3 3 6-8M15 8h3v3M5 6h3M5 10h2' }],
  account: [{ d: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0' }],
  settings: [{ d: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19 12a7 7 0 0 0-.1-1.2l2.1-1.6-2-3.4-2.5 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.5-1-2 3.4 2.1 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2L3 14.8l2 3.4 2.5-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.5 1 2-3.4-2.1-1.6c.1-.4.1-.8.1-1.2z' }],
  users: [{ d: 'M16 19a4 4 0 0 0-8 0M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 19a3.5 3.5 0 0 0-3-3.46M17 5.5a2.5 2.5 0 0 1 0 5' }],
  setup: [{ d: 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h4M16 16l1.5 1.5L21 14' }],
  fallback: [{ d: 'M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v6H4zM14 15h6v6h-6z' }],
};

export default function NavIcon({ iconKey, className = 'h-4 w-4' }: NavIconProps) {
  const paths = ICON_PATHS[iconKey ?? 'fallback'] ?? ICON_PATHS.fallback;

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
    >
      {paths.map((path) => (
        <path key={path.d} d={path.d} fill={path.fill ? 'currentColor' : undefined} />
      ))}
    </svg>
  );
}
