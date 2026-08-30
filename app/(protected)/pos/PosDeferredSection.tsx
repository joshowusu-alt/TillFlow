import { prisma } from '@/lib/prisma';
import { unstable_cache } from 'next/cache';
import PosWelcomeShelf from '@/components/pos/PosWelcomeShelf';
import { PosDeferredApply, type PosDeferredPayload } from '@/components/pos/PosProgressiveShell';
import { measureServerOperation, PERFORMANCE_THRESHOLDS_MS, appLog } from '@/lib/observability';
import HomeSectionErrorBoundary from '@/components/owner-home/HomeSectionErrorBoundary';
import {
  posCategoriesTag,
  posCustomersTag,
  posShiftsTag,
  posTillsTag,
} from '@/lib/cache/pos-tags';

function getCachedUnits(businessId: string) {
  return unstable_cache(
    () => prisma.unit.findMany({ select: { id: true, name: true } }),
    ['pos-units', businessId],
    { revalidate: 300, tags: ['pos-units'] },
  )();
}

function getCachedCategories(businessId: string) {
  return unstable_cache(
    () =>
      prisma.category.findMany({
        where: { businessId },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, colour: true },
      }),
    ['pos-categories', businessId],
    { revalidate: 120, tags: [posCategoriesTag(businessId)] },
  )();
}

function getCachedTills(businessId: string, storeId: string) {
  return unstable_cache(
    () =>
      prisma.till.findMany({
        where: { storeId, active: true },
        select: { id: true, name: true },
      }),
    ['pos-tills', businessId, storeId],
    { revalidate: 300, tags: [posTillsTag(businessId, storeId)] },
  )();
}

function getCachedCustomers(businessId: string) {
  return unstable_cache(
    () =>
      prisma.customer.findMany({
        where: { businessId },
        select: { id: true, name: true, creditLimitPence: true, loyaltyPointsBalance: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ['pos-customers', businessId],
    { revalidate: 60, tags: [posCustomersTag(businessId)] },
  )();
}

function getCachedShifts(businessId: string, storeId: string) {
  return unstable_cache(
    () =>
      prisma.shift.findMany({
        where: { till: { storeId }, status: 'OPEN' },
        select: { id: true, tillId: true },
      }),
    ['pos-shifts', businessId, storeId],
    { revalidate: 10, tags: [posShiftsTag(businessId, storeId)] },
  )();
}

type PosDeferredSectionProps = {
  businessId: string;
  storeId: string;
  storeName: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  requestedCustomerId?: string;
};

async function loadSettled<T>(label: string, meta: Record<string, string>, run: () => Promise<T>): Promise<T | null> {
  try {
    return await measureServerOperation(
      label,
      run,
      { ...meta, cacheState: 'cached-wrapper' },
      { thresholdMs: PERFORMANCE_THRESHOLDS_MS.route, operationType: 'route' },
    );
  } catch (error) {
    appLog('error', 'pos_deferred_load_failed', {
      businessId: meta.businessId,
      storeId: meta.storeId,
      stage: label,
      status: 'unavailable',
    });
    void error;
    return null;
  }
}

/**
 * Deferred POS extras — customers, tills/shifts, units, categories, welcome shelf.
 * Failures are isolated so cash search/add stays usable.
 */
export default async function PosDeferredSection({
  businessId,
  storeId,
  storeName,
  userId,
  userName,
  userEmail,
  requestedCustomerId,
}: PosDeferredSectionProps) {
  const meta = { businessId, storeId, route: '/pos' };

  return measureServerOperation(
    'page.pos.deferred-data-load',
    async () => {
      const [tills, openShifts, units, categories, customers, requestedCustomer, userOpenShift] =
        await Promise.all([
          loadSettled('page.pos.tills-load', meta, () => getCachedTills(businessId, storeId)),
          loadSettled('page.pos.shifts-load', meta, () => getCachedShifts(businessId, storeId)),
          loadSettled('page.pos.units-load', meta, () => getCachedUnits(businessId)),
          loadSettled('page.pos.categories-load', meta, () => getCachedCategories(businessId)),
          loadSettled('page.pos.customers-load', meta, () => getCachedCustomers(businessId)),
          requestedCustomerId
            ? loadSettled('page.pos.requested-customer-load', meta, () =>
                prisma.customer.findFirst({
                  where: { id: requestedCustomerId, businessId },
                  select: {
                    id: true,
                    name: true,
                    creditLimitPence: true,
                    loyaltyPointsBalance: true,
                  },
                }),
              )
            : Promise.resolve(null),
          measureServerOperation(
            'page.pos.open-shift-load',
            () =>
              prisma.shift.findFirst({
                where: { userId, till: { storeId }, closedAt: null },
                select: { till: { select: { name: true } } },
              }),
            { ...meta, cacheState: 'uncached-page-load' },
            { thresholdMs: PERFORMANCE_THRESHOLDS_MS.action, operationType: 'route' },
          ).catch((error) => {
            appLog('error', 'pos_deferred_load_failed', {
              businessId,
              storeId,
              stage: 'page.pos.open-shift-load',
              status: 'unavailable',
            });
            void error;
            return null;
          }),
        ]);

      const customersUnavailable = customers === null;
      const checkoutUnavailable = tills === null || openShifts === null;
      const resolvedCustomers = customers ?? [];
      const withRequested =
        requestedCustomer && !resolvedCustomers.some((customer) => customer.id === requestedCustomer.id)
          ? [requestedCustomer, ...resolvedCustomers]
          : resolvedCustomers;

      const payload: PosDeferredPayload = {
        tills: (tills ?? []).map((till) => ({ id: till.id, name: till.name })),
        openShiftTillIds: (openShifts ?? []).map((shift) => shift.tillId),
        openShifts: (openShifts ?? []).map((shift) => ({ tillId: shift.tillId, shiftId: shift.id })),
        cashierUserId: userId,
        customers: withRequested.map((customer) => ({
          id: customer.id,
          name: customer.name,
          creditLimitPence: customer.creditLimitPence,
          loyaltyPointsBalance: customer.loyaltyPointsBalance ?? 0,
        })),
        units: (units ?? []).map((unit) => ({ id: unit.id, name: unit.name })),
        categories: (categories ?? []).map((cat) => ({
          id: cat.id,
          name: cat.name,
          colour: cat.colour ?? '#64748b',
        })),
        customersUnavailable,
        checkoutUnavailable,
      };

      const firstName =
        (userName ?? '').trim().split(/\s+/)[0] || userEmail.split('@')[0] || 'there';

      return (
        <HomeSectionErrorBoundary
          section="pos-deferred"
          fallback={
            <div className="mx-auto mb-3 max-w-5xl px-4 sm:px-6" role="status">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Checkout extras are temporarily unavailable. You can still search products and build a cash cart.
              </div>
              <PosDeferredApply
                payload={{
                  tills: [],
                  openShiftTillIds: [],
                  customers: [],
                  units: [],
                  categories: [],
                  customersUnavailable: true,
                  checkoutUnavailable: true,
                }}
              />
            </div>
          }
        >
          <PosWelcomeShelf
            firstName={firstName}
            storeName={storeName}
            hasOpenShift={Boolean(userOpenShift)}
            openTillName={userOpenShift?.till?.name ?? null}
            userKey={userId}
          />
          <PosDeferredApply payload={payload} />
        </HomeSectionErrorBoundary>
      );
    },
    meta,
    { thresholdMs: PERFORMANCE_THRESHOLDS_MS.route, operationType: 'route' },
  );
}
