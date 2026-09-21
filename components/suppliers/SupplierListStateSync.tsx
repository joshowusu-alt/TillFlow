'use client';

import { useListState } from '@/lib/ui/use-list-state';

type SupplierListStateSyncProps = {
  q: string;
  page: number;
  amountOwed: boolean;
};

/**
 * Persists the supplier list's search / page / filter and scroll offset so that
 * opening a supplier and coming back lands on the same row. The bare `/suppliers`
 * route is deliberately not redirected: the KPI cards link to it to clear filters.
 */
export default function SupplierListStateSync({ q, page, amountOwed }: SupplierListStateSyncProps) {
  useListState('/suppliers', {
    q,
    page,
    filters: { amountOwed: amountOwed ? '1' : undefined },
    restoreOnBareRoute: false,
  });
  return null;
}
