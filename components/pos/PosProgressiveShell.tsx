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

export type PosDeferredPayload = {
  tills: { id: string; name: string }[];
  openShiftTillIds: string[];
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
  products: Array<{
    id: string;
    name: string;
    barcode: string | null;
    sellingPriceBasePence: number;
    vatRateBps: number;
    promoBuyQty: number;
    promoGetQty: number;
    categoryId: string | null;
    categoryName: string | null;
    imageUrl: string | null;
    units: Array<{
      id: string;
      name: string;
      pluralName: string;
      conversionToBase: number;
      isBaseUnit: boolean;
      sellingPricePence: number | null;
      defaultCostPence: number | null;
    }>;
    onHandBase: number;
  }>;
  children?: ReactNode;
};

export function PosProgressiveShell({ business, store, products, children }: PosProgressiveShellProps) {
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
      <PosClient
        business={business}
        store={store}
        products={products}
        tills={extras.tills}
        openShiftTillIds={extras.openShiftTillIds}
        customers={extras.customers}
        units={extras.units}
        categories={extras.categories}
        checkoutExtrasReady={checkoutExtrasReady}
        customersUnavailable={Boolean(extras.customersUnavailable)}
        checkoutUnavailable={checkoutUnavailable}
      />
      {children}
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
      className="mx-auto mb-3 max-w-5xl px-4 sm:px-6"
      role="status"
      aria-live="polite"
      data-pos-deferred-loading="true"
    >
      <div className="rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-xs text-slate-600 shadow-sm">
        Preparing customers, till, and checkout options…
      </div>
    </div>
  );
}
