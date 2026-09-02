import { notFound } from 'next/navigation';
import CompactRouteLoading from '@/components/CompactRouteLoading';
import PosBoardSkeleton from '@/app/(protected)/pos/PosBoardSkeleton';
import CommandCenterLoading from '@/app/(protected)/reports/command-center/loading';
import OwnerIntelligenceLoading from '@/app/(protected)/reports/owner/loading';
import { isE2eLoadingHarnessEnabled } from '@/lib/loading/e2e-loading-harness';
import { ROUTE_SKELETON_REGISTRY } from '@/lib/loading/route-skeleton-registry';

export default function LoadingHarnessPage({
  searchParams,
}: {
  searchParams?: { route?: string };
}) {
  if (!isE2eLoadingHarnessEnabled()) {
    notFound();
  }

  const route = searchParams?.route ?? '/products';
  const entry = ROUTE_SKELETON_REGISTRY.find((item) => item.route === route);
  if (!entry) {
    notFound();
  }

  if (entry.variant === 'pos') {
    return <PosBoardSkeleton />;
  }
  if (entry.variant === 'command-center') {
    return <CommandCenterLoading />;
  }
  if (entry.variant === 'owner') {
    return <OwnerIntelligenceLoading />;
  }

  return (
    <CompactRouteLoading
      variant={
        entry.variant as Exclude<
          (typeof ROUTE_SKELETON_REGISTRY)[number]['variant'],
          'pos' | 'command-center' | 'owner'
        >
      }
    />
  );
}
