import Skeleton from '@/components/Skeleton';

export default function CashflowForecastLoading() {
  return (
    <div className="space-y-6">
      <Skeleton variant="line" className="h-8 w-64" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Skeleton variant="stat" count={4} />
      </div>
      <Skeleton variant="chart" />
      <Skeleton variant="card" />
    </div>
  );
}
