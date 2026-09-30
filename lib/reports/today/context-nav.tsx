import { headers } from 'next/headers';
import { ReportsReturnPath } from '@/components/reports/ReportsContextNav';
import { prisma } from '@/lib/prisma';
import { returnPathFor, safeReturnStoreId } from '@/lib/reports/today/stage3a-nav';

export async function ReportsContextNav({ businessId }: { businessId: string }) {
  const pathname = headers().get('x-pathname') || '';
  const path = returnPathFor(pathname);
  if (!path) return null;
  const search = headers().get('x-search') || '';
  const stores = await prisma.store.findMany({
    where: { businessId },
    select: { id: true },
  });
  const storeId = safeReturnStoreId(search, stores.map((store) => store.id));
  return <ReportsReturnPath path={path} storeId={storeId} />;
}
