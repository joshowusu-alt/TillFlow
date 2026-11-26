'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import PosClient from '@/app/(protected)/pos/PosClient';
import type { PosCatalogueMode, SellableProductDto } from '@/lib/pos/sellable-dto';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { getPosTillStorageKey } from '@/lib/business-scope';

export type PosDeferredPayload = {
  tills: { id: string; name: string }[];
  openShiftTillIds: string[];
  openShifts?: { tillId: string; shiftId: string }[];
  cashierUserId?: string;
  customers: {
    id: string;
    name: string;
    creditLimitPence: number;
    loyaltyPointsBalance: number;
  }[];
  units: { id: string; name: string }[];
  categories: { id: string; name: string; colour: string }[];
  customersUnavailable?: boolean;
  checkoutUnavailable?: boolean;
};

type PosDeferredContextValue = {
  applyDeferred: (payload: PosDeferredPayload) => void;
};

const PosDeferredContext = createContext<PosDeferredContextValue | null>(null);

const EMPTY_DEFERRED: PosDeferredPayload = {
  tills: [],
  openShiftTillIds: [],
  customers: [],
  units: [],
  categories: [],
};

type PosProgressiveShellProps = {
  business: {
    id: string;
    currency: string;
    vatEnabled: boolean;
    canManageDishes?: boolean;
    foodBusiness?: boolean;
    momoEnabled?: boolean;
    momoProvider?: string | null;
    requireOpenTillForSales?: boolean;
    discountApprovalThresholdBps?: number;
    loyaltyEnabled?: boolean;
    loyaltyPointsPerGhsPence?: number;
    loyaltyGhsPerHundredPoints?: number;
  };
  store: { id: string; name: string };
  cashierUserId?: string;
  products: SellableProductDto[];
  posCatalogueMode?: PosCatalogueMode;
  catalogueSize?: number;
  children?: ReactNode;
};

export function PosProgressiveShell({
  business,
  store,
  cashierUserId,
  products,
  posCatalogueMode,
  catalogueSize,
  children,
}: PosProgressiveShellProps) {
  const scopeKey = JSON.stringify([business.id, store.id, cashierUserId]);
  const [deferredState, setDeferred] = useState<{ scopeKey: string; payload: PosDeferredPayload } | null>(null);
  const deferred = deferredState?.scopeKey === scopeKey ? deferredState.payload : null;
  const online = useNetworkStatus();
  const [recovered, setRecovered] = useState<{ scopeKey: string; payload: PosDeferredPayload } | null>(null);

  // Only recover a previously selected till for this branch and this cashier.
  // An authoritative closed-till response always wins over capture metadata.
  useEffect(() => {
    setRecovered(null);
    const scope = { businessId: business.id, storeId: store.id };
    try {
      const tillId = localStorage.getItem(getPosTillStorageKey(scope));
      if (!tillId) return;
      const shiftKey = `pos.capture.shift.${business.id}.${tillId}`;
      if (deferred && !deferred.checkoutUnavailable) {
        if (!deferred.openShiftTillIds.includes(tillId)) localStorage.removeItem(shiftKey);
        return;
      }
      if (online || !cashierUserId ||
        localStorage.getItem(`pos.capture.cashier.${business.id}`) !== cashierUserId) return;
      const shiftId = localStorage.getItem(shiftKey);
      if (!shiftId) return;
      setRecovered({ scopeKey, payload: {
        ...EMPTY_DEFERRED,
        tills: [{ id: tillId, name: 'Saved till' }],
        openShiftTillIds: [tillId],
        openShifts: [{ tillId, shiftId }],
        cashierUserId,
        customersUnavailable: true,
      } });
    } catch {
      // No verified capture context: leave checkout blocked with guidance.
    }
  }, [business.id, store.id, cashierUserId, online, deferred, scopeKey]);

  const applyDeferred = useCallback((payload: PosDeferredPayload) => {
    setDeferred({ scopeKey, payload });
  }, [scopeKey]);

  const value = useMemo(() => ({ applyDeferred }), [applyDeferred]);
  const offlineRecovery = !online && (!deferred || deferred.checkoutUnavailable) && recovered?.scopeKey === scopeKey ? recovered.payload : null;
  const extras = offlineRecovery ?? deferred ?? EMPTY_DEFERRED;
  const checkoutExtrasReady = Boolean(offlineRecovery || (deferred && !deferred.checkoutUnavailable));
  const checkoutUnavailable = !offlineRecovery && Boolean(deferred?.checkoutUnavailable);

  return (
    <PosDeferredContext.Provider value={value}>
      {/* Welcome / deferred loading hint above the till so mobile does not bury them under checkout padding. */}
      {children}
      <PosClient
        business={business}
        store={store}
        products={products}
        posCatalogueMode={posCatalogueMode}
        catalogueSize={catalogueSize}
        tills={extras.tills}
        openShiftTillIds={extras.openShiftTillIds}
        openShifts={extras.openShifts}
        cashierUserId={extras.cashierUserId}
        customers={extras.customers}
        units={extras.units}
        categories={extras.categories}
        checkoutExtrasReady={checkoutExtrasReady}
        customersUnavailable={Boolean(extras.customersUnavailable)}
        checkoutUnavailable={checkoutUnavailable}
      />
    </PosDeferredContext.Provider>
  );
}

export function PosDeferredApply({ payload }: { payload: PosDeferredPayload }) {
  const ctx = useContext(PosDeferredContext);

  useLayoutEffect(() => {
    ctx?.applyDeferred(payload);
  }, [ctx, payload]);

  return null;
}

export function PosDeferredLoadingHint() {
  return (
    <p
      className="sr-only"
      role="status"
      aria-live="polite"
      data-pos-deferred-loading="true"
    >
      Preparing checkout…
    </p>
  );
}
