import Skeleton from '@/components/Skeleton';

export default function CommandCenterLoading() {
  return (
    <div className="space-y-6">
      <Skeleton variant="line" className="h-8 w-72" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton variant="card" />
        <div className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Skeleton variant="stat" count={4} />
          </div>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton variant="card" />
        <Skeleton variant="card" />
      </div>
    </div>
  );
}
