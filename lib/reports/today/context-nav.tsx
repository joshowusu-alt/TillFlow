import { Suspense } from 'react';
import { prisma } from '@/lib/prisma';
import { ReportsContextNavClient } from '@/lib/reports/today/context-nav-client';

export async function ReportsContextNav({ businessId }: { businessId: string }) {
  const stores = await prisma.store.findMany({
    where: { businessId },
    select: { id: true },
  });
  return (
    <Suspense fallback={null}>
      <ReportsContextNavClient ownedStoreIds={stores.map((store) => store.id)} />
    </Suspense>
  );
}
