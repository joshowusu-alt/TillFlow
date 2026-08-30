import { Suspense } from 'react';
import { prisma } from '@/lib/prisma';
import type { requireBusinessStore } from '@/lib/auth';
import { unstable_cache } from 'next/cache';
import {
  PosDeferredLoadingHint,
  PosProgressiveShell,
} from '@/components/pos/PosProgressiveShell';
import PosDeferredSection from './PosDeferredSection';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS } from '@/lib/observability';
import {
  SELLABLE_PRODUCT_SELECT,
  resolvePosCatalogueMode,
  toSellableProductDto,
} from '@/lib/pos/sellable-dto';
import { posInventoryTag, posProductsTag } from '@/lib/cache/pos-tags';

function getCachedProducts(businessId: string) {
  return unstable_cache(
    () =>
      prisma.product.findMany({
        where: { businessId, active: true },
        select: SELLABLE_PRODUCT_SELECT,
      }),
    ['pos-products', businessId],
    { revalidate: 60, tags: [posProductsTag(businessId)] },
  )();
}

function getCachedInventory(businessId: string, storeId: string) {
  return unstable_cache(
    () =>
      prisma.inventoryBalance.findMany({
        where: { storeId },
        select: { productId: true, qtyOnHandBase: true },
      }),
    ['pos-inventory', businessId, storeId],
    { revalidate: 30, tags: [posInventoryTag(businessId, storeId)] },
  )();
}

type RequireBusinessStoreResult = Awaited<ReturnType<typeof requireBusinessStore>>;

type PosBoardProps = {
  business: RequireBusinessStoreResult['business'];
  store: RequireBusinessStoreResult['store'];
  user: RequireBusinessStoreResult['user'];
  requestedCustomerId?: string;
};

/**
 * Critical POS loader — products + inventory only so search/scan/add can start
 * before customers, tills, categories, and checkout extras finish loading.
 */
export default async function PosBoard({
  business,
  store: baseStore,
  user,
  requestedCustomerId,
}: PosBoardProps) {
  const posRouteMeta = {
    businessId: business.id,
    storeId: baseStore.id,
    route: '/pos',
  };
  const posRouteTiming = {
    thresholdMs: PERFORMANCE_THRESHOLDS_MS.route,
    operationType: 'route' as const,
  };

  return measureServerOperation(
    'page.pos.total-load',
    async () => {
      const measurePosFetch = <T,>(
        operation: string,
        callback: () => Promise<T>,
        cacheState: string,
      ) =>
        measureServerOperation(
          operation,
          callback,
          { ...posRouteMeta, cacheState },
          posRouteTiming,
        );

      const productCount = await measurePosFetch(
        'page.pos.catalogue-count',
        () =>
          prisma.product.count({
            where: { businessId: business.id, active: true },
          }),
        'live',
      );
      const catalogueMode = resolvePosCatalogueMode({
        productCount,
        posCatalogueMode: process.env.POS_CATALOGUE_MODE,
      });

      const { inventory, products } = await measureServerOperation(
        'page.pos.initial-data-load',
        async () => {
          if (catalogueMode === 'paged') {
            return {
              inventory: [] as { productId: string; qtyOnHandBase: number }[],
              products: [] as Awaited<ReturnType<typeof getCachedProducts>>,
            };
          }
          const [inventoryRows, productRows] = await Promise.all([
            measurePosFetch(
              'page.pos.inventory-load',
              () => getCachedInventory(business.id, baseStore.id),
              'cached-wrapper',
            ),
            measurePosFetch(
              'page.pos.products-load',
              () => getCachedProducts(business.id),
              'cached-wrapper',
            ),
          ]);
          return { inventory: inventoryRows, products: productRows };
        },
        { ...posRouteMeta, cacheState: 'cached-wrapper' },
        posRouteTiming,
      );

      const productDtos = await measureServerOperation(
        'page.pos.dto-map',
        async () => {
          const inventoryMap = new Map(inventory.map((item) => [item.productId, item.qtyOnHandBase]));
          return products.map((product) =>
            toSellableProductDto(product, inventoryMap.get(product.id) ?? 0)
          );
        },
        { ...posRouteMeta, cacheState: 'cpu-map', rowCount: products.length },
        { thresholdMs: PERFORMANCE_THRESHOLDS_MS.action, operationType: 'route' },
      );

      return (
        <PosProgressiveShell
          business={{
            id: business.id,
            currency: business.currency,
            vatEnabled: business.vatEnabled,
            momoEnabled: (business as any).momoEnabled ?? false,
            momoProvider: (business as any).momoProvider ?? null,
            requireOpenTillForSales: (business as any).requireOpenTillForSales ?? false,
            discountApprovalThresholdBps: (business as any).discountApprovalThresholdBps ?? 1500,
            loyaltyEnabled: (business as any).loyaltyEnabled ?? false,
            loyaltyPointsPerGhsPence: (business as any).loyaltyPointsPerGhsPence ?? 1,
            loyaltyGhsPerHundredPoints: (business as any).loyaltyGhsPerHundredPoints ?? 100,
          }}
          store={{ id: baseStore.id, name: baseStore.name }}
          products={productDtos}
          posCatalogueMode={catalogueMode}
          catalogueSize={productCount}
        >
          <Suspense fallback={<PosDeferredLoadingHint />}>
            <PosDeferredSection
              businessId={business.id}
              storeId={baseStore.id}
              storeName={baseStore.name}
              userId={user.id}
              userName={user.name}
              userEmail={user.email}
              requestedCustomerId={requestedCustomerId}
            />
          </Suspense>
        </PosProgressiveShell>
      );
    },
    posRouteMeta,
    posRouteTiming,
  );
}
