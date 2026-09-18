'use client';

import { useListState } from '@/lib/ui/use-list-state';

type ProductListStateSyncProps = {
  q: string;
  page: number;
  tab: string;
  issue?: string;
};

export default function ProductListStateSync({ q, page, tab, issue }: ProductListStateSyncProps) {
  useListState('/products', {
    q,
    page,
    tab,
    filters: { issue },
    restoreOnBareRoute: !issue,
    bareDefaults: { q: '', page: 1, tab: 'products' },
  });
  return null;
}
