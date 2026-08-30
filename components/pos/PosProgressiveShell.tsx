'use client';

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import PosClient from '@/app/(protected)/pos/PosClient';
import type { PosCatalogueMode, SellableProductDto } from '@/lib/pos/sellable-dto';

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
    momoEnabled?: boolean;
    momoProvider?: string | null;
    requireOpenTillForSales?: boolean;
    discountApprovalThresholdBps?: number;
    loyaltyEnabled?: boolean;
    loyaltyPointsPerGhsPence?: number;
    loyaltyGhsPerHundredPoints?: number;
  };
  store: { id: string; name: string };
  products: SellableProductDto[];
  posCatalogueMode?: PosCatalogueMode;
  catalogueSize?: number;
  children?: ReactNode;
};

export function PosProgressiveShell({
  business,
  store,
  products,
  posCatalogueMode,
  catalogueSize,
  children,
}: PosProgressiveShellProps) {
  const [deferred, setDeferred] = useState<PosDeferredPayload | null>(null);

  const applyDeferred = useCallback((payload: PosDeferredPayload) => {
    setDeferred(payload);
  }, []);

  const value = useMemo(() => ({ applyDeferred }), [applyDeferred]);
  const extras = deferred ?? EMPTY_DEFERRED;
  const checkoutExtrasReady = deferred !== null && !deferred.checkoutUnavailable;
  const checkoutUnavailable = Boolean(deferred?.checkoutUnavailable);

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
    <div
      className="mb-2"
      role="status"
      aria-live="polite"
      data-pos-deferred-loading="true"
    >
      <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200/80 bg-white/90 px-2.5 py-1.5 text-xs text-slate-600 shadow-sm">
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-accent motion-reduce:animate-none"
          aria-hidden="true"
        />
        Preparing checkout…
      </div>
    </div>
  );
}
