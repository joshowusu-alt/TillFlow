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

const getCachedProducts = unstable_cache(
  (businessId: string) =>
    prisma.product.findMany({
      where: { businessId, active: true },
      select: SELLABLE_PRODUCT_SELECT,
    }),
  ['pos-products'],
  { revalidate: 60, tags: ['pos-products'] },
);

const getCachedInventory = unstable_cache(
  (storeId: string) =>
    prisma.inventoryBalance.findMany({
      where: { storeId },
      select: { productId: true, qtyOnHandBase: true },
    }),
  ['pos-inventory'],
  { revalidate: 30, tags: ['pos-inventory'] },
);

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

      const [inventory, productLoad] = await measureServerOperation(
        'page.pos.initial-data-load',
        () =>
          Promise.all([
            measurePosFetch('page.pos.inventory-load', () => getCachedInventory(baseStore.id), 'cached-wrapper'),
            measurePosFetch(
              'page.pos.products-load',
              async () => {
                const productCount = await prisma.product.count({
                  where: { businessId: business.id, active: true },
                });
                const catalogueMode = resolvePosCatalogueMode({
                  productCount,
                  posCatalogueMode: process.env.POS_CATALOGUE_MODE,
                });
                if (catalogueMode === 'paged') {
                  return { products: [] as Awaited<ReturnType<typeof getCachedProducts>>, productCount, catalogueMode };
                }
                const products = await getCachedProducts(business.id);
                return { products, productCount: products.length, catalogueMode };
              },
              'cached-wrapper',
            ),
          ]),
        { ...posRouteMeta, cacheState: 'cached-wrapper' },
        posRouteTiming,
      );

      const productDtos = await measureServerOperation(
        'page.pos.dto-map',
        async () => {
          const inventoryMap = new Map(inventory.map((item) => [item.productId, item.qtyOnHandBase]));
          return productLoad.products.map((product) =>
            toSellableProductDto(product, inventoryMap.get(product.id) ?? 0)
          );
        },
        { ...posRouteMeta, cacheState: 'cpu-map', rowCount: productLoad.products.length },
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
          posCatalogueMode={productLoad.catalogueMode}
          catalogueSize={productLoad.productCount}
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
