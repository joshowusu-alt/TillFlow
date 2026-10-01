'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { ReportsReturnPath } from '@/components/reports/ReportsContextNav';
import { chromeStoreId, returnPathFor } from '@/lib/reports/today/stage3a-nav';

/**
 * Follows the address the customer is actually on. The reports layout stays
 * mounted across these routes, so a header captured on the first request
 * would keep the previous report’s breadcrumb — or none, when that first
 * request was the directory.
 */
export function ReportsContextNavClient({ ownedStoreIds }: { ownedStoreIds: readonly string[] }) {
  const pathname = usePathname() || '';
  const search = useSearchParams();
  const path = returnPathFor(pathname);
  if (!path) return null;
  const storeId = chromeStoreId(
    'withheld' in path ? { href: path.href, withheld: true } : { href: path.href },
    search?.toString() ?? '',
    ownedStoreIds,
  );
  return <ReportsReturnPath path={path} storeId={storeId} />;
}
