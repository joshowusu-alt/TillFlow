import { Suspense } from 'react';
import { requireBusinessAndOptionalStore } from '@/lib/auth';
import PosBoard from './PosBoard';
import PosBoardSkeleton from './PosBoardSkeleton';
import LaunchSessionCompletion from '@/components/LaunchSessionCompletion';
import SelectOperationalStoreNotice from '@/components/SelectOperationalStoreNotice';
import EffectiveStoreBanner from '@/components/EffectiveStoreBanner';

export default async function PosPage({
  searchParams,
}: {
  searchParams?: { customerId?: string };
}) {
  // Auth/role gate stays blocking (cache-deduped from the protected layout) so
  // access control is never deferred behind the streamed POS skeleton.
  const { business, store, user, stores } = await requireBusinessAndOptionalStore();
  if (!business) {
    return <div className="card p-6">Run the seed to initialize the business.</div>;
  }
  if (!store) {
    return (
      <SelectOperationalStoreNotice
        stores={stores}
        canSwitch={user.role === 'OWNER' || user.role === 'MANAGER'}
        title="Select a branch before selling"
      />
    );
  }

  const requestedCustomerId = searchParams?.customerId?.trim() || undefined;

  return (
    <>
      <LaunchSessionCompletion />
      <div className="mb-3">
        <EffectiveStoreBanner
          storeName={store.name}
          actionLabel={`Sales on this screen will be recorded in ${store.name}.`}
        />
      </div>
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
