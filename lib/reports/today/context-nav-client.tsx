'use client';

import { useLayoutEffect, useRef } from 'react';
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
  const query = search?.toString() ?? '';
  const frame = useRef<HTMLDivElement>(null);
  const path = returnPathFor(pathname);
  useLayoutEffect(() => {
    const nav = frame.current?.querySelector('nav');
    if (!nav) return;
    const header = document.querySelector('header');
    const limit = header?.getBoundingClientRect().bottom ?? 0;
    const top = nav.getBoundingClientRect().top;
    if (top < limit - 1) window.scrollBy(0, top - limit - 4);
  }, [pathname, query]);
  if (!path) return null;
  const storeId = chromeStoreId(
    'withheld' in path ? { href: path.href, withheld: true } : { href: path.href },
    query,
    ownedStoreIds,
  );
  return (
    <div ref={frame} style={{ overflowAnchor: 'none' }}>
      <ReportsReturnPath path={path} storeId={storeId} />
    </div>
  );
}
