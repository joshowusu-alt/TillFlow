import { Suspense } from 'react';
import { requireBusinessStore } from '@/lib/auth';
import PosBoard from './PosBoard';
import PosBoardSkeleton from './PosBoardSkeleton';
import LaunchSessionCompletion from '@/components/LaunchSessionCompletion';

export default async function PosPage({
  searchParams,
}: {
  searchParams?: { customerId?: string };
}) {
  // Auth/role gate stays blocking (cache-deduped from the protected layout) so
  // access control is never deferred behind the streamed POS skeleton.
  const { business, store, user } = await requireBusinessStore();
  if (!business) {
    return <div className="card p-6">Run the seed to initialize the business.</div>;
  }

  const requestedCustomerId = searchParams?.customerId?.trim() || undefined;

  return (
    <>
      <LaunchSessionCompletion />
      <Suspense fallback={<PosBoardSkeleton />}>
        <PosBoard
          business={business}
          store={store}
          user={user}
          requestedCustomerId={requestedCustomerId}
        />
      </Suspense>
    </>
  );
}
