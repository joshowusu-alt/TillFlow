'use client';

import { useListState } from '@/lib/ui/use-list-state';

type ProductListStateSyncProps = {
  q: string;
  page: number;
  tab: string;
  issue?: string;
  category?: string;
  division?: string;
  group?: string;
};

export default function ProductListStateSync({ q, page, tab, issue, category, division, group }: ProductListStateSyncProps) {
  useListState('/products', {
    q,
    page,
    tab,
    filters: { issue, category, division, group },
    restoreOnBareRoute: !issue,
    bareDefaults: { q: '', page: 1, tab: 'products' },
  });
  return null;
}
