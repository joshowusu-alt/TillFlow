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
  resetClassification?: boolean;
};

export default function ProductListStateSync({ q, page, tab, issue, category, division, group, resetClassification }: ProductListStateSyncProps) {
  useListState('/products', {
    q,
    page,
    tab,
    filters: { issue, category, division, group },
    restoreOnBareRoute: !issue && !resetClassification,
    bareDefaults: { q: '', page: 1, tab: 'products' },
  });
  return null;
}
