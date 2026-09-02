'use client';

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { formatMoney } from '@/lib/format';
import { useParkedCarts } from '@/hooks/useParkedCarts';
import { usePersistedPosCart } from '@/hooks/usePersistedPosCart';
import { usePosCartActions } from '@/hooks/usePosCartActions';
import { usePosKeyboardShortcuts } from '@/hooks/usePosKeyboardShortcuts';
import {
  usePosMomoPayment,
  useStalePosMomoCollectionReset,
  type CollectionNetwork,
  type MomoCollectionState,
} from '@/hooks/usePosMomoPayment';
import { usePosOrderDiscount } from '@/hooks/usePosOrderDiscount';
import { usePosProductDropdownViewport } from '@/hooks/usePosProductDropdownViewport';
import { usePosSaleResult } from '@/hooks/usePosSaleResult';
import { usePosScannerBuffer } from '@/hooks/usePosScannerBuffer';
import { usePosUndoHistory } from '@/hooks/usePosUndoHistory';
import { useStagedProductSelection } from '@/hooks/useStagedProductSelection';
import { getProductBaseUnitId } from '@/lib/payments/pos-barcode';
import { buildPosProductIndex } from '@/lib/pos/product-index';
import { resolvePosTillId } from '@/lib/pos/till-context';
import { usePosBarcodeHandler } from '@/hooks/usePosBarcodeHandler';
import { usePosLoyaltyRedemption } from '@/hooks/usePosLoyaltyRedemption';
import LoyaltyRedemptionPanel from './components/LoyaltyRedemptionPanel';
import { computeDiscount } from '@/lib/payments/pos-checkout';
import { applyOptimisticStock, buildOfflinePayments, buildOptimisticStockDecrements, createSaleCompletionSnapshot, type PosCompletionSnapshot } from '@/lib/payments/pos-completion';
import { calculateCheckoutSummary } from '@/lib/payments/pos-checkout';
import {
  buildPosSaleAttemptStorageKey,
  readPersistedSaleAttempt,
} from '@/lib/payments/pos-persistence';
import { notifyPosTransactionActive } from '@/lib/pwa/transaction-activity-guard';
import {
  applyPaidSingleMethodDefaults,
  buildOnlineSaleExternalRef,
  nextSaleAttemptId,
  paymentMethodLabel,
  primaryCheckoutLabel,
  resolveDueDateForSubmit,
  type DueDateDecision,
} from '@/lib/payments/pos-checkout-state';
import { buildAvailableBaseMap, buildCartDetails, buildProductMap, formatAvailable, getAvailableBase as getAvailableBaseForCart, getUnitFromProduct, sumCartTotals } from '@/lib/payments/pos-cart';
import { filterPosProducts } from '@/lib/payments/pos-search';
import type { PosCatalogueMode, SellableProductDto } from '@/lib/pos/sellable-dto';
import {
  POS_OFFLINE_CATALOGUE_LIMIT_MESSAGE,
  resolvePosCatalogueMode,
  showOfflineCatalogueLimit,
} from '@/lib/pos/sellable-dto';
import type { BarcodeScanResolution } from '@/lib/payments/pos-barcode';
import type { PosProduct } from '@/lib/payments/pos-cart';
import { completeSaleAction } from '@/app/actions/sales';
import { dispatchNavKpiRefresh } from '@/lib/navigation/nav-kpi-events';
import {
  getLastReceiptStorageKey,
  getParkedCartsStorageKey,
  getPosCartStorageKey,
  getPosCustomerStorageKey,
  getPosTillStorageKey,
} from '@/lib/business-scope';
import { DISCOUNT_REASON_CODES } from '@/lib/fraud/reason-codes';
import { queueOfflineSale } from '@/lib/offline';
import { usePosCustomers, type PosCustomerOption } from '@/hooks/usePosCustomers';
import SummarySidebar from './components/SummarySidebar';
import KeyboardHelpModal from './components/KeyboardHelpModal';
import QuickAddPanel from './components/QuickAddPanel';
import ParkModal from './components/ParkModal';
import QuickAddCustomer from './components/QuickAddCustomer';
import CameraScanner from './components/CameraScanner';
import CustomerSelector from './components/CustomerSelector';
import CustomerCreditWarning from './components/CustomerCreditWarning';
import PosCheckoutPanel from './components/PosCheckoutPanel';
import PosMobileCartBar from './components/PosMobileCartBar';
import PosMobileCartCheckoutSheet from './components/PosMobileCartCheckoutSheet';

function formatRelativeTime(timestamp: string) {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'just now';

  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes <= 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

type ProductDto = SellableProductDto;

type CategoryDto = { id: string; name: string; colour: string };

type PosClientProps = {
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
  tills: { id: string; name: string }[];
  openShiftTillIds: string[];
  openShifts?: { tillId: string; shiftId: string }[];
  cashierUserId?: string;
  products: ProductDto[];
  posCatalogueMode?: PosCatalogueMode;
  catalogueSize?: number;
  customers: PosCustomerOption[];
  units: { id: string; name: string }[];
  categories: CategoryDto[];
  /** False until deferred checkout extras (tills/shifts) have loaded. */
  checkoutExtrasReady?: boolean;
  /** True when customer list failed — cash sales remain usable. */
  customersUnavailable?: boolean;
  /** True when tills/shifts failed to load (distinct from still loading). */
  checkoutUnavailable?: boolean;
};

type CartLine = {
  id: string;
  productId: string;
  unitId: string;
  qtyInUnit: number;
  discountType?: DiscountType;
  discountValue?: string;
  lineSubtotalPence?: number;
  qtyBase?: number;
  weighedLabel?: string;
};

type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_MONEY';
type DiscountType = 'NONE' | 'PERCENT' | 'AMOUNT';
type SaleCompletionSnapshot = PosCompletionSnapshot<
  CartLine,
  ProductDto,
  'PAID' | 'PART_PAID' | 'UNPAID',
  PaymentMethod,
  DiscountType,
  CollectionNetwork,
  MomoCollectionState
>;

export default function PosClient({
  business,
  store,
  tills,
  openShiftTillIds,
  openShifts,
  cashierUserId,
  products,
  posCatalogueMode,
  catalogueSize,
  customers,
  units,
  categories,
  checkoutExtrasReady = true,
  customersUnavailable = false,
  checkoutUnavailable = false,
}: PosClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const safeUnits = useMemo(() => units ?? [], [units]);
  const [productOptions, setProductOptions] = useState<ProductDto[]>(products);
  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const [unitId, setUnitId] = useState(products[0]?.units.find((u) => u.isBaseUnit)?.id ?? '');
  const [qtyInUnitInput, setQtyInUnitInput] = useState('1');
  const [paymentStatus, setPaymentStatus] = useState<'PAID' | 'PART_PAID' | 'UNPAID'>('PAID');
  const [barcode, setBarcode] = useState('');
  const [tillId, setTillId] = useState(() => {
    return resolvePosTillId({
      requestedTillId: searchParams?.get('till') ?? searchParams?.get('tillId'),
      tills,
      openShiftTillIds,
    });
  });
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(['CASH']);
  const [cashTendered, setCashTendered] = useState('');
  const [cardPaid, setCardPaid] = useState('');
  const [transferPaid, setTransferPaid] = useState('');
  const [cardRef, setCardRef] = useState('');
  const [transferRef, setTransferRef] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueDateDecision, setDueDateDecision] = useState<DueDateDecision>('unset');
  const [showSplitPanel, setShowSplitPanel] = useState(false);
  const saleAttemptStorageKey = useMemo(
    () => buildPosSaleAttemptStorageKey(business.id, store.id),
    [business.id, store.id]
  );
  const [saleAttemptId, setSaleAttemptId] = useState(nextSaleAttemptId);
  const [ambiguousFailure, setAmbiguousFailure] = useState(false);
  const saleIdentityRef = useRef<string>('');
  const saleAttemptRestoredRef = useRef(false);
  const [saleAttemptReady, setSaleAttemptReady] = useState(false);
  const {
    momoPaid,
    setMomoPaid,
    momoRef,
    setMomoRef,
    momoPayerMsisdn,
    setMomoPayerMsisdn,
    momoNetwork,
    setMomoNetwork,
    momoCollectionId,
    momoCollectionStatus,
    momoCollectionError,
    momoIdempotencyKey,
    momoCollectionSignature,
    isInitiatingMomo,
    resetMomoCollection,
    resetMomoPaymentFields,
    restoreMomoSnapshot,
    handleInitiateMomoCollection,
    availablePaymentMethods,
    momoGuidance,
  } = usePosMomoPayment({
    storeId: store.id,
    momoEnabled: business.momoEnabled ?? false,
    momoProvider: business.momoProvider,
  });
  const [stockAlert, setStockAlert] = useState<string | null>(null);
  const [barcodeAlert, setBarcodeAlert] = useState<string | null>(null);
  const orderDiscountForm = usePosOrderDiscount<DiscountType>('NONE');
  const {
    type: orderDiscountType,
    input: orderDiscountInput,
    managerPin: discountManagerPin,
    reasonCode: discountReasonCode,
    reason: discountReason,
  } = orderDiscountForm;
  const saleResult = usePosSaleResult({ nextCustomerReadyMs: 2600 });
  const {
    lastReceiptId,
    saleSuccess,
    saleError,
    isCompletingSale,
    nextCustomerReady,
    setLastReceiptId,
    showSaleSuccess,
    dismissSaleSuccess,
    setSaleError,
    dismissSaleError,
    beginCompletion,
    endCompletion,
    setNextCustomerReady,
  } = saleResult;
  const barcodeRef = useRef<HTMLInputElement>(null);

  const cashRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddBarcode, setQuickAddBarcode] = useState('');
  const [pendingScan, setPendingScan] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [serverSearchMatches, setServerSearchMatches] = useState<ProductDto[]>([]);
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const productSearchRef = useRef<HTMLInputElement>(null);
  const productSearchShellRef = useRef<HTMLDivElement>(null);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const {
    canUndo,
    stack: undoStack,
    push: pushUndo,
    undo: popUndoSnapshot,
    clear: clearUndoStack,
    replace: restoreUndoStack,
  } = usePosUndoHistory<CartLine[]>({ maxSteps: 10 });
  const {
    isCompactViewport,
    viewport: productDropdownViewport,
    recompute: recomputeProductDropdownViewport,
  } = usePosProductDropdownViewport(productDropdownOpen, productSearchShellRef);
  const [showQuickCustomer, setShowQuickCustomer] = useState(false);
  const {
    customerOptions,
    customerSearch,
    customerSearchError,
    setCustomerSearch,
    addCustomerOption,
  } = usePosCustomers(customers);

  // Park/hold state
  const [showParkModal, setShowParkModal] = useState(false);
  const [showParkedPanel, setShowParkedPanel] = useState(false);
  const [phoneCheckoutSheetOpen, setPhoneCheckoutSheetOpen] = useState(false);
  const mobileCartBarRef = useRef<HTMLButtonElement>(null);
  const storageScope = useMemo(
    () => ({ businessId: business.id, storeId: store.id }),
    [business.id, store.id]
  );
  const cartStorageKey = useMemo(() => getPosCartStorageKey(storageScope), [storageScope]);
  const customerStorageKey = useMemo(() => getPosCustomerStorageKey(storageScope), [storageScope]);
  const parkedCartsStorageKey = useMemo(() => getParkedCartsStorageKey(storageScope), [storageScope]);
  const lastReceiptStorageKey = useMemo(() => getLastReceiptStorageKey(storageScope), [storageScope]);
  const tillStorageKey = useMemo(() => getPosTillStorageKey(storageScope), [storageScope]);
  const {
    parkedCarts,
    parkCurrentCart,
    recallParkedCart,
    deleteParkedCart,
  } = useParkedCarts<CartLine>({ storageKey: parkedCartsStorageKey });
  const productExists = useCallback(
    (productId: string) => productOptions.some((product) => product.id === productId),
    [productOptions]
  );
  const customerExists = useCallback(
    (nextCustomerId: string) => customerOptions.some((customer) => customer.id === nextCustomerId),
    [customerOptions]
  );
  const {
    cart,
    setCart,
    customerId,
    setCustomerId,
    cartRestored,
    cartHydrated,
    clearSavedCart,
  } = usePersistedPosCart<CartLine>({
    productExists,
    customerExists,
    cartStorageKey,
    customerStorageKey,
  });
  /** Filled vs empty cart. Phone vs desktop chrome is CSS (`max-md` / `md`), not matchMedia. */
  const cartFilled = cart.length > 0;

  useEffect(() => {
    barcodeRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const urlCustomerId = searchParams?.get('customerId');
    if (urlCustomerId && customerExists(urlCustomerId)) {
      setCustomerId(urlCustomerId);
    }
  }, [customerExists, searchParams, setCustomerId]);

  const playBeep = useCallback((success: boolean) => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.value = success ? 800 : 300;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.1;
      oscillator.start();
      oscillator.stop(audioContext.currentTime + (success ? 0.1 : 0.2));
    } catch {
      // Audio not supported
    }
  }, []);

  const handleUndo = useCallback(() => {
    const previousCart = popUndoSnapshot();
    if (!previousCart) return;
    setCart(previousCart);
    playBeep(true);
  }, [popUndoSnapshot, playBeep, setCart]);

  const urlCatalogueMode = searchParams?.get('posCatalogueMode');
  const useServerCatalogue =
    resolvePosCatalogueMode({
      productCount: catalogueSize ?? productOptions.length,
      posCatalogueMode: posCatalogueMode ?? urlCatalogueMode,
    }) === 'paged';
  const knownCatalogueSize = catalogueSize ?? productOptions.length;

  // O(1) product lookup via Map — avoids O(n) find() per cart line
  const productMap = useMemo(
    () => buildProductMap(productOptions as unknown as PosProduct[]),
    [productOptions]
  );
  const productIndex = useMemo(() => buildPosProductIndex(productOptions), [productOptions]);

  const mergeProductOption = useCallback((incoming: ProductDto) => {
    setProductOptions((prev) => (prev.some((product) => product.id === incoming.id) ? prev : [...prev, incoming]));
  }, []);

  const getProduct = useCallback(
    (id: string) => productMap.get(id),
    [productMap]
  );
  const getUnit = useCallback(getUnitFromProduct, []);

  const getAvailableBase = useCallback((targetProductId: string, excludeLineId?: string) => {
    return getAvailableBaseForCart(cart, productMap, targetProductId, excludeLineId);
  }, [cart, productMap]);

  const clampQtyInUnit = useCallback((
    targetProductId: string,
    targetUnitId: string,
    desiredQty: number,
    excludeLineId?: string
  ) => {
    const product = getProduct(targetProductId);
    const unit = getUnit(product, targetUnitId);
    if (!product || !unit) return desiredQty;
    const availableBase = getAvailableBase(targetProductId, excludeLineId);
    if (availableBase <= 0) {
      setStockAlert(`No stock available for ${product.name}.`);
      return 0;
    }
    const maxQty = Math.floor(availableBase / unit.conversionToBase);
    if (desiredQty > maxQty) {
      const availableLabel = formatAvailable(product, availableBase);
      setStockAlert(`Only ${availableLabel} available for ${product.name}.`);
      return maxQty;
    }
    setStockAlert(null);
    return desiredQty;
  }, [getAvailableBase, getProduct, getUnit]);

  const {
    activeLineId,
    qtyDrafts,
    setActiveLineId,
    setQtyDrafts,
    removeLine,
    addToCart,
    commitLineQty,
    decrementLineQty,
    incrementLineQty,
    setLineDiscountType,
    setLineDiscountValue,
    changeLineUnit,
  } = usePosCartActions<CartLine>({
    cart,
    setCart,
    pushUndo,
    clampQtyInUnit,
    onFirstCartLine: () => router.prefetch('/pos'),
  });

  const selectedProduct = useMemo(
    () => productOptions.find((product) => product.id === productId),
    [productOptions, productId]
  );
  const selectedUnits = selectedProduct?.units ?? [];
  const selectedUnit = selectedUnits.find((unit) => unit.id === unitId) ?? selectedUnits[0];

  const openQuickAdd = useCallback((barcodeValue?: string) => {
    setQuickAddOpen(true);
    setQuickAddBarcode(barcodeValue ?? '');
  }, []);

  useEffect(() => {
    barcodeRef.current?.focus();
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setLastReceiptId(window.localStorage.getItem(lastReceiptStorageKey) ?? '');
    }
  }, [lastReceiptStorageKey, setLastReceiptId]);

  // Resolve till selection when deferred tills/shifts arrive (or on remount).
  // Progressive POS starts with empty tills, so the initial useState fallback
  // cannot pick tills[0] until checkout extras are applied.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (tills.length === 0) return;

    const saved = window.localStorage.getItem(tillStorageKey);
    setTillId((current) =>
      resolvePosTillId({
        requestedTillId: searchParams?.get('till') ?? searchParams?.get('tillId'),
        savedTillId: saved,
        currentTillId: current,
        tills,
        openShiftTillIds,
      }),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tillStorageKey,
    openShiftTillIds.join('|'),
    tills.map((t) => t.id).join('|'),
  ]);

  // Persist till selection to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined' && tillId) {
      window.localStorage.setItem(tillStorageKey, tillId);
      const capturedShiftId = openShifts?.find((shift) => shift.tillId === tillId)?.shiftId;
      if (capturedShiftId) {
        window.localStorage.setItem(`pos.capture.shift.${business.id}.${tillId}`, capturedShiftId);
      }
      if (cashierUserId) {
        window.localStorage.setItem(`pos.capture.cashier.${business.id}`, cashierUserId);
      }
    }
  }, [tillStorageKey, tillId, openShifts, cashierUserId, business.id]);

  // Restore the last online idempotency identity after a remount (e.g. SW reload).
  // Apply after cart hydrate so the sale-identity rotator does not immediately replace it.
  useEffect(() => {
    if (!cartHydrated || saleAttemptRestoredRef.current) return;
    saleAttemptRestoredRef.current = true;
    if (typeof window === 'undefined') {
      setSaleAttemptReady(true);
      return;
    }
    try {
      const restored = readPersistedSaleAttempt(window.sessionStorage.getItem(saleAttemptStorageKey));
      if (restored) {
        setSaleAttemptId(restored.attemptId);
        setAmbiguousFailure(restored.ambiguousFailure);
      }
    } catch {
      // Storage errors must not crash POS — continue with a fresh attempt id.
    }
    setSaleAttemptReady(true);
  }, [cartHydrated, saleAttemptStorageKey]);

  // Keep the idempotency identity available across soft remounts while a cart or
  // uncertain outcome is active; clear it once the terminal becomes idle.
  // Wait for cart hydration so we do not wipe a restored attempt before it loads.
  useEffect(() => {
    if (typeof window === 'undefined' || !cartHydrated || !saleAttemptReady) return;
    const shouldPersist = cart.length > 0 || ambiguousFailure || isCompletingSale;
    try {
      if (!shouldPersist) {
        window.sessionStorage.removeItem(saleAttemptStorageKey);
        return;
      }
      window.sessionStorage.setItem(
        saleAttemptStorageKey,
        JSON.stringify({ attemptId: saleAttemptId, ambiguousFailure })
      );
    } catch {
      // Ignore quota / private-mode failures.
    }
  }, [ambiguousFailure, cart.length, cartHydrated, isCompletingSale, saleAttemptId, saleAttemptReady, saleAttemptStorageKey]);

  // Block SW hard-reload and POS pull-to-refresh while a live transaction exists.
  useEffect(() => {
    const active = cart.length > 0 || isCompletingSale || ambiguousFailure;
    notifyPosTransactionActive(active);
    return () => {
      // Unmount must not flush a deferred SW reload — a remount may still own
      // an active cart. Clear the signal only; the next mount re-asserts active.
      notifyPosTransactionActive(false, { flushOnInactive: false });
    };
  }, [ambiguousFailure, cart.length, isCompletingSale]);

  const restoreSaleSnapshot = useCallback((snapshot: SaleCompletionSnapshot, errorMessage: string) => {
    setProductOptions(snapshot.productOptions);
    setCart(snapshot.cart);
    setCustomerId(snapshot.customerId);
    setCashTendered(snapshot.cashTendered);
    setCardPaid(snapshot.cardPaid);
    setTransferPaid(snapshot.transferPaid);
    restoreMomoSnapshot(snapshot);
    setPaymentStatus(snapshot.paymentStatus);
    setPaymentMethods(snapshot.paymentMethods);
    orderDiscountForm.restore(snapshot);
    setQtyDrafts(snapshot.qtyDrafts);
    restoreUndoStack(snapshot.undoStack);
    setSaleError(errorMessage);
    playBeep(false);
  }, [
    orderDiscountForm,
    playBeep,
    restoreUndoStack,
    restoreMomoSnapshot,
    setCart,
    setCustomerId,
    setQtyDrafts,
    setSaleError,
  ]);

  const hasMethod = (method: PaymentMethod) => paymentMethods.includes(method);

  const clearCashFields = useCallback(() => {
    setCashTendered('');
  }, []);

  const clearCardFields = useCallback(() => {
    setCardPaid('');
    setCardRef('');
  }, []);

  const clearTransferFields = useCallback(() => {
    setTransferPaid('');
    setTransferRef('');
  }, []);

  const clearDueDateState = useCallback(() => {
    setDueDate('');
    setDueDateDecision('unset');
  }, []);

  const handlePaymentStatusChange = useCallback((nextStatus: 'PAID' | 'PART_PAID' | 'UNPAID') => {
    setPaymentStatus(nextStatus);
    setAmbiguousFailure(false);
    if (nextStatus === 'PAID') {
      clearDueDateState();
      if (paymentMethods.length === 0) {
        setPaymentMethods(['CASH']);
      }
      return;
    }
    if (nextStatus === 'UNPAID') {
      clearCashFields();
      clearCardFields();
      clearTransferFields();
      resetMomoPaymentFields();
      setPaymentMethods([]);
      setShowSplitPanel(false);
      return;
    }
    // PART_PAID — keep methods but ensure at least one for receiving payment
    if (paymentMethods.length === 0) {
      setPaymentMethods(['CASH']);
    }
  }, [
    clearCashFields,
    clearCardFields,
    clearDueDateState,
    clearTransferFields,
    paymentMethods.length,
    resetMomoPaymentFields,
  ]);

  const clearFieldsForAbsentMethods = useCallback((next: PaymentMethod[]) => {
    if (!next.includes('CASH')) clearCashFields();
    if (!next.includes('CARD')) clearCardFields();
    if (!next.includes('TRANSFER')) clearTransferFields();
    if (!next.includes('MOBILE_MONEY')) resetMomoPaymentFields();
  }, [clearCashFields, clearCardFields, clearTransferFields, resetMomoPaymentFields]);

  const isSplitMode = showSplitPanel || paymentMethods.length > 1;

  const togglePaymentMethod = (method: PaymentMethod) => {
    if (paymentStatus === 'UNPAID') return;

    // Outside explicit Split mode, methods are mutually exclusive — a normal
    // method click replaces Cash (or any prior single method) and never implies split.
    if (!isSplitMode) {
      if (paymentMethods.length === 1 && paymentMethods[0] === method) {
        return;
      }
      const next: PaymentMethod[] = [method];
      clearFieldsForAbsentMethods(next);
      setShowSplitPanel(false);
      setPaymentMethods(next);
      return;
    }

    // Split mode: allow additive multi-method selection.
    const exists = paymentMethods.includes(method);
    let next = exists
      ? paymentMethods.filter((current) => current !== method)
      : [...paymentMethods, method];
    if (next.length === 0) {
      next = ['CASH'];
    }
    if (exists) {
      if (method === 'CASH') clearCashFields();
      if (method === 'CARD') clearCardFields();
      if (method === 'TRANSFER') clearTransferFields();
      if (method === 'MOBILE_MONEY') resetMomoPaymentFields();
    }
    if (next.length === 1) {
      clearFieldsForAbsentMethods(next);
    }
    setPaymentMethods(next);
  };

  const handleToggleSplitPanel = () => {
    if (showSplitPanel || paymentMethods.length > 1) {
      // Leave Split: collapse to one method and drop stale split-only amounts/refs.
      const keep = paymentMethods[0] ?? 'CASH';
      const next: PaymentMethod[] = [keep];
      clearFieldsForAbsentMethods(next);
      // Reset kept non-cash amounts so single-method Paid defaults re-apply the full due.
      if (keep === 'CARD') setCardPaid('');
      if (keep === 'TRANSFER') setTransferPaid('');
      if (keep === 'MOBILE_MONEY') setMomoPaid('');
      if (keep === 'CASH') clearCashFields();
      setPaymentMethods(next);
      setShowSplitPanel(false);
      return;
    }
    setShowSplitPanel(true);
  };

  useEffect(() => {
    if (!useServerCatalogue) {
      setServerSearchMatches([]);
      return;
    }
    const q = productSearch.trim();
    if (!q) {
      setServerSearchMatches([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q, storeId: store.id, take: '12' });
      void fetch(`/api/pos/search?${params}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { products: [] }))
        .then((data: { products?: ProductDto[] }) => {
          setServerSearchMatches(Array.isArray(data.products) ? data.products : []);
        })
        .catch(() => {
          if (!controller.signal.aborted) setServerSearchMatches([]);
        });
    }, 150);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [productSearch, store.id, useServerCatalogue]);

  const filteredProducts = useMemo(() => {
    if (useServerCatalogue) return serverSearchMatches;
    return filterPosProducts(productOptions, productSearch, 12, productIndex);
  }, [useServerCatalogue, serverSearchMatches, productOptions, productSearch, productIndex]);
  const productSearchMatches = filteredProducts.length;

  // Viewport sizing for the product dropdown in compact mode is handled by
  // usePosProductDropdownViewport. This useEffect only dismisses popovers on
  // orientation change and nudges the hook to remeasure afterwards.
  useEffect(() => {
    const handleOrientationChange = () => {
      setProductDropdownOpen(false);
      setShowKeyboardHelp(false);
      setShowQuickCustomer(false);
      setCameraOpen(false);
      setQuickAddOpen(false);
      setShowParkModal(false);

      window.requestAnimationFrame(recomputeProductDropdownViewport);
    };

    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, [recomputeProductDropdownViewport]);

  const {
    stagedProduct,
    stagedUnitId,
    setStagedUnitId,
    stagedQty,
    setStagedQty,
    stageProduct,
    clearStagedProduct,
    commitStagedProduct,
  } = useStagedProductSelection<ProductDto>({ onAddToCart: addToCart });

  const handleQuickCreated = useCallback((created: { id: string; name: string; sku?: string | null; barcode: string | null; sellingPriceBasePence: number; vatRateBps: number; isTaxable?: boolean; promoBuyQty: number; promoGetQty: number; onHandBase: number; units: { id: string; name: string; pluralName: string; conversionToBase: number; isBaseUnit: boolean; sellingPricePence?: number | null }[] }, matchedScan: boolean) => {
    setQuickAddOpen(false);
    setProductId(created.id);
    const baseUnitId = getProductBaseUnitId(created);
    setUnitId(baseUnitId);
    setProductOptions((prev) => [
      ...prev,
      {
        ...created,
        sku: created.sku ?? null,
        isTaxable: created.isTaxable ?? true,
        categoryName: null,
        units: created.units.map((unit) => ({
          ...unit,
          sellingPricePence: unit.sellingPricePence ?? null,
        })),
      },
    ]);
    if (matchedScan) {
      addToCart({ productId: created.id, unitId: baseUnitId, qtyInUnit: 1 });
    }
    setPendingScan(null);
    setBarcodeAlert(null);
    setBarcode('');
  }, [addToCart]);

  const handleQuickCancel = useCallback(() => {
    setQuickAddOpen(false);
    setPendingScan(null);
    setBarcodeAlert(null);
  }, []);

  const handleAddToCart = () => {
    const parsed = Number(qtyInUnitInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setStockAlert('Enter a quantity greater than 0.');
      return;
    }
    const desiredQty = Math.floor(parsed);
    addToCart({ productId, unitId, qtyInUnit: desiredQty });
    setQtyInUnitInput('1');
    setBarcodeAlert(null);
    barcodeRef.current?.focus();
  };

  const handleAddStaged = () => {
    if (!commitStagedProduct()) return;
    setProductSearch('');
    playBeep(true);
    barcodeRef.current?.focus();
  };

  const { handleBarcodeScan } = usePosBarcodeHandler({
    products: productOptions,
    productIndex,
    lookupRemote: useServerCatalogue
      ? async (code) => {
          const params = new URLSearchParams({ code, storeId: store.id });
          const res = await fetch(`/api/pos/barcode?${params}`);
          if (!res.ok) return null;
          const data = (await res.json()) as BarcodeScanResolution<ProductDto>;
          if (data.kind === 'missing' || !('product' in data) || !data.product) return data;
          mergeProductOption(data.product);
          return data;
        }
      : undefined,
    addToCart: (line) => {
      addToCart(line);
      setProductId(line.productId);
      setUnitId(line.unitId);
      setQtyInUnitInput(String(line.qtyInUnit));
      setBarcode('');
      setBarcodeAlert(null);
      setStockAlert(null);
      barcodeRef.current?.focus();
    },
    playBeep,
    onMissing: (code) => {
      setBarcodeAlert(`Barcode "${code}" not found. Create the product now.`);
      setPendingScan(code);
      openQuickAdd(code);
    },
  });

  const cartDetails = useMemo(
    () => buildCartDetails(cart, productMap, business.vatEnabled),
    [cart, productMap, business.vatEnabled]
  );

  // Pre-compute available stock per product once per cart change — O(n) instead of O(n²)
  const availableBaseMap = useMemo(() => buildAvailableBaseMap(cart, productMap), [cart, productMap]);

  const totals = useMemo(() => sumCartTotals(cartDetails), [cartDetails]);

  const manualOrderDiscount = useMemo(
    () => computeDiscount(totals.netSubtotal, orderDiscountType, orderDiscountInput),
    [totals.netSubtotal, orderDiscountType, orderDiscountInput]
  );

  const selectedCustomer = useMemo(
    () => customerOptions.find((customer) => customer.id === customerId),
    [customerOptions, customerId]
  );

  const loyaltyRedemption = usePosLoyaltyRedemption({
    enabled: Boolean(business.loyaltyEnabled),
    settings: {
      loyaltyEnabled: Boolean(business.loyaltyEnabled),
      loyaltyPointsPerGhsPence: business.loyaltyPointsPerGhsPence ?? 1,
      loyaltyGhsPerHundredPoints: business.loyaltyGhsPerHundredPoints ?? 100,
    },
    customerId,
    pointsBalance: selectedCustomer?.loyaltyPointsBalance ?? 0,
    netSubtotalPence: Math.max(totals.netSubtotal - manualOrderDiscount, 0),
  });

  const resetActiveSale = useCallback((options?: { resetPaymentStatus?: boolean; playSuccessTone?: boolean }) => {
    setCart([]);
    clearSavedCart();
    setCustomerId('');
    clearCashFields();
    clearCardFields();
    clearTransferFields();
    resetMomoPaymentFields();
    clearDueDateState();
    setPaymentMethods(['CASH']);
    setShowSplitPanel(false);
    setAmbiguousFailure(false);
    orderDiscountForm.reset();
    loyaltyRedemption.reset();
    setQtyDrafts({});
    clearUndoStack();
    if (options?.resetPaymentStatus) {
      setPaymentStatus('PAID');
    }
    if (options?.playSuccessTone) {
      playBeep(true);
    }
  }, [
    clearCashFields,
    clearCardFields,
    clearDueDateState,
    clearSavedCart,
    clearTransferFields,
    clearUndoStack,
    loyaltyRedemption,
    orderDiscountForm,
    playBeep,
    resetMomoPaymentFields,
    setCart,
    setCustomerId,
    setQtyDrafts,
  ]);

  const checkoutSummary = useMemo(() => {
    const effectiveMethods = paymentStatus === 'UNPAID' ? [] : paymentMethods;
    const preliminary = calculateCheckoutSummary({
      totals,
      orderDiscountType,
      orderDiscountInput,
      loyaltyDiscountPence: loyaltyRedemption.loyaltyDiscountPence,
      vatEnabled: business.vatEnabled,
      discountApprovalThresholdBps: business.discountApprovalThresholdBps,
      discountManagerPin,
      discountReasonCode,
      discountReason,
      paymentMethods: effectiveMethods.length ? effectiveMethods : (paymentStatus === 'UNPAID' ? [] : ['CASH']),
      cashTendered: paymentStatus === 'UNPAID' ? '' : cashTendered,
      cardPaid: paymentStatus === 'UNPAID' ? '' : cardPaid,
      transferPaid: paymentStatus === 'UNPAID' ? '' : transferPaid,
      momoPaid: paymentStatus === 'UNPAID' ? '' : momoPaid,
      momoNetwork,
      momoPayerMsisdn,
      momoCollectionStatus,
    });

    // Empty paymentMethods is only valid for UNPAID; calculateCheckoutSummary needs a list.
    if (paymentStatus === 'UNPAID') {
      return {
        ...preliminary,
        cashTenderedValue: 0,
        cardPaidValue: 0,
        transferPaidValue: 0,
        momoPaidValue: 0,
        nonCashOverpay: false,
        totalPaid: 0,
        balanceRemaining: preliminary.totalDue,
        cashApplied: 0,
        changeDue: 0,
        needsMomoConfirmation: false,
        momoConfirmed: false,
        usedExactCashDefault: false,
      };
    }

    const defaults = applyPaidSingleMethodDefaults({
      paymentStatus,
      paymentMethods: effectiveMethods,
      totalDuePence: preliminary.totalDue,
      cashTendered,
      cardPaid,
      transferPaid,
      momoPaid,
    });

    const withDefaults = calculateCheckoutSummary({
      totals,
      orderDiscountType,
      orderDiscountInput,
      loyaltyDiscountPence: loyaltyRedemption.loyaltyDiscountPence,
      vatEnabled: business.vatEnabled,
      discountApprovalThresholdBps: business.discountApprovalThresholdBps,
      discountManagerPin,
      discountReasonCode,
      discountReason,
      paymentMethods: effectiveMethods,
      cashTendered: defaults.cashTendered,
      cardPaid: defaults.cardPaid,
      transferPaid: defaults.transferPaid,
      momoPaid: defaults.momoPaid,
      momoNetwork,
      momoPayerMsisdn,
      momoCollectionStatus,
    });

    return {
      ...withDefaults,
      usedExactCashDefault: defaults.usedExactCashDefault,
    };
  }, [
    totals,
    orderDiscountType,
    orderDiscountInput,
    loyaltyRedemption.loyaltyDiscountPence,
    business.vatEnabled,
    business.discountApprovalThresholdBps,
    discountManagerPin,
    discountReasonCode,
    discountReason,
    paymentMethods,
    paymentStatus,
    cashTendered,
    cardPaid,
    transferPaid,
    momoPaid,
    momoNetwork,
    momoPayerMsisdn,
    momoCollectionStatus,
  ]);

  const {
    orderDiscount,
    discountBps,
    requiresDiscountApproval,
    discountApprovalReady,
    vatTotal,
    totalDue,
    cashTenderedValue,
    cardPaidValue,
    transferPaidValue,
    momoPaidValue,
    nonCashOverpay,
    totalPaid,
    balanceRemaining,
    cashApplied,
    changeDue,
    needsMomoConfirmation,
    momoConfirmed,
    momoSignature,
  } = checkoutSummary;

  const handleParkCurrentCart = useCallback((label: string) => {
    const result = parkCurrentCart({ cart, customerId, label });
    if (!result) return;
    resetActiveSale({ playSuccessTone: true });
  }, [cart, customerId, parkCurrentCart, resetActiveSale]);

  const handleRecallParkedCart = useCallback((parkedId: string) => {
    const result = recallParkedCart({
      parkedId,
      currentCart: cart,
      currentCustomerId: customerId,
      productExists,
      customerExists,
    });
    if (!result) return;

    setCart(result.restoredCart);
    setCustomerId(result.restoredCustomerId);
    setNextCustomerReady(false);
    playBeep(true);
  }, [cart, customerExists, customerId, playBeep, productExists, recallParkedCart, setCart, setCustomerId, setNextCustomerReady]);

  const handleCompleteSale = async () => {
    if (!canSubmit || isCompletingSale) return;

    const dueResolved = resolveDueDateForSubmit({
      paymentStatus,
      dueDateDecision,
      dueDate,
    });
    if (!dueResolved.ok) {
      setSaleError(dueResolved.error);
      return;
    }

    beginCompletion();
    setAmbiguousFailure(false);

    const saleSnapshot = createSaleCompletionSnapshot<CartLine, ProductDto, 'PAID' | 'PART_PAID' | 'UNPAID', PaymentMethod, DiscountType, CollectionNetwork, MomoCollectionState>({
      productOptions,
      cart,
      customerId,
      cashTendered,
      cardPaid,
      transferPaid,
      momoPaid,
      momoRef,
      momoPayerMsisdn,
      momoNetwork,
      momoCollectionId,
      momoCollectionStatus,
      momoCollectionError,
      momoIdempotencyKey,
      momoCollectionSignature,
      paymentStatus,
      paymentMethods,
      orderDiscountType,
      orderDiscountInput,
      discountManagerPin,
      discountReasonCode,
      discountReason,
      qtyDrafts,
      undoStack,
    });

    const loyaltyPointsToRedeem = loyaltyRedemption.pointsToRedeem;
    const externalRef = buildOnlineSaleExternalRef(saleAttemptId);
    const submitCashPaid = paymentStatus === 'UNPAID' ? 0 : Math.max(0, Math.round(cashApplied));
    const submitCardPaid = paymentStatus === 'UNPAID' ? 0 : Math.max(0, Math.round(cardPaidValue));
    const submitTransferPaid = paymentStatus === 'UNPAID' ? 0 : Math.max(0, Math.round(transferPaidValue));
    const submitMomoPaid = paymentStatus === 'UNPAID' ? 0 : Math.max(0, Math.round(momoPaidValue));

    try {
      const result = await completeSaleAction({
        storeId: store.id,
        tillId,
        cart: JSON.stringify(saleSnapshot.cart),
        paymentStatus,
        customerId: saleSnapshot.customerId,
        dueDate: dueResolved.dueDate,
        dueDateDecision: paymentStatus === 'PAID' ? 'unset' : dueDateDecision,
        ...orderDiscountForm.toServicePayload(),
        loyaltyPointsToRedeem,
        cashPaid: submitCashPaid,
        cardPaid: submitCardPaid,
        transferPaid: submitTransferPaid,
        momoPaid: submitMomoPaid,
        momoRef: paymentStatus === 'UNPAID' ? undefined : (momoRef.trim() || undefined),
        cardRef: paymentStatus === 'UNPAID' ? undefined : (cardRef.trim() || undefined),
        transferRef: paymentStatus === 'UNPAID' ? undefined : (transferRef.trim() || undefined),
        cashReceivedPence: paymentStatus === 'UNPAID' ? 0 : Math.max(0, Math.round(cashTenderedValue)),
        changeDuePence: paymentStatus === 'UNPAID' ? 0 : Math.max(0, Math.round(changeDue)),
        externalRef,
        momoCollectionId: momoCollectionId || undefined,
        momoPayerMsisdn: paymentStatus === 'UNPAID' ? undefined : (momoPayerMsisdn.trim() || undefined),
        momoNetwork,
      });

      if (result.success) {
        const { receiptId, totalPence, transactionNumber } = result.data;
        const stockDecrements = buildOptimisticStockDecrements(saleSnapshot.cart, saleSnapshot.productOptions);
        setProductOptions((prev) => applyOptimisticStock(prev, stockDecrements));
        resetActiveSale({ resetPaymentStatus: true, playSuccessTone: true });
        setSaleAttemptId(nextSaleAttemptId());
        barcodeRef.current?.focus();
        setLastReceiptId(receiptId);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(lastReceiptStorageKey, receiptId);
        }
        showSaleSuccess({ receiptId, totalPence, transactionNumber }, 3000);
        dispatchNavKpiRefresh();
      } else {
        setSaleError(result.error);
      }
    } catch (err) {
      if (!navigator.onLine || (err instanceof TypeError && err.message.includes('fetch'))) {
        try {
          const offlineId = await queueOfflineSale({
            businessId: business.id,
            storeId: store.id,
            tillId,
            shiftId: window.localStorage.getItem(`pos.capture.shift.${business.id}.${tillId}`),
            cashierUserId: window.localStorage.getItem(`pos.capture.cashier.${business.id}`),
            customerId: saleSnapshot.customerId || null,
            paymentStatus,
            lines: saleSnapshot.cart.map((l) => {
              const product = saleSnapshot.productOptions.find((p) => p.id === l.productId);
              const unitPricePence = product?.sellingPriceBasePence;
              return {
                productId: l.productId,
                unitId: l.unitId,
                qtyInUnit: l.qtyInUnit,
                qtyBase: l.qtyBase,
                unitPricePence,
                lineSubtotalPence: l.lineSubtotalPence,
                discountType: l.discountType ?? 'NONE',
                discountValue: l.discountValue ?? '',
              };
            }),
            payments: buildOfflinePayments({
              cashApplied: submitCashPaid,
              cardPaidValue: submitCardPaid,
              transferPaidValue: submitTransferPaid,
              momoPaidValue: submitMomoPaid,
            }),
            orderDiscountType,
            orderDiscountValue: orderDiscountInput,
            createdAt: new Date().toISOString(),
            localSaleTime: new Date().toISOString(),
            idempotencyKey: saleAttemptId,
          });
          const stockDecrements = buildOptimisticStockDecrements(saleSnapshot.cart, saleSnapshot.productOptions);
          setProductOptions((prev) => applyOptimisticStock(prev, stockDecrements));
          resetActiveSale({ resetPaymentStatus: true, playSuccessTone: true });
          setSaleAttemptId(nextSaleAttemptId());
          barcodeRef.current?.focus();
          showSaleSuccess({ receiptId: offlineId, totalPence: totalDue, transactionNumber: '(Queued offline)' }, 4000);
        } catch {
          setAmbiguousFailure(true);
          setSaleError('Could not confirm this sale. The cart was kept — retry carefully to avoid a duplicate.');
        }
      } else {
        setAmbiguousFailure(true);
        setSaleError('Sale outcome is unclear. The cart was kept. Retry only if the receipt was not created.');
      }
    } finally {
      endCompletion();
    }
  };

  useStalePosMomoCollectionReset({
    momoCollectionId,
    momoCollectionStatus,
    momoCollectionSignature,
    momoSignature,
    needsMomoConfirmation,
    resetMomoCollection,
  });

  const activePaymentMethodLabels = useMemo(
    () => (paymentStatus === 'UNPAID' ? ['Credit'] : paymentMethods.map((method) => paymentMethodLabel(method))),
    [paymentMethods, paymentStatus]
  );
  const latestParkedCart = useMemo(
    () => parkedCarts[parkedCarts.length - 1] ?? null,
    [parkedCarts]
  );
  const oldestParkedCart = useMemo(
    () => parkedCarts[0] ?? null,
    [parkedCarts]
  );

  const handleBarcodeKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const code = barcode.trim();
    if (!code) return;
    handleBarcodeScan(code);
  };

  const requiresCustomer = paymentStatus !== 'PAID';
  const fullyPaid = paymentStatus === 'PAID' ? totalPaid >= totalDue : true;
  const partPaidValid =
    paymentStatus !== 'PART_PAID' || (totalPaid > 0 && balanceRemaining > 0 && totalPaid < totalDue);
  const unpaidValid = paymentStatus !== 'UNPAID' || totalPaid === 0;
  const dueDateReady =
    paymentStatus === 'PAID' ||
    dueDateDecision === 'none' ||
    (dueDateDecision === 'date' && Boolean(dueDate.trim()));
  const hasPaymentError = nonCashOverpay || (paymentStatus === 'PAID' && cashTendered.trim() !== '' && Number(cashTendered) < 0);
  const tenderMalformed =
    [cashTendered, cardPaid, transferPaid, momoPaid].some((value) => {
      if (!value.trim()) return false;
      const parsed = Number(String(value).replace(/,/g, ''));
      return !Number.isFinite(parsed) || parsed < 0;
    });
  // MoMo collection API not yet integrated — allow sales with MoMo as a
  // manually-recorded payment method (same as cash/card/transfer).  Once
  // providers are connected, flip this back to:
  //   const momoReady = !needsMomoConfirmation || momoConfirmed;
  const momoReady = true;
  const checkoutLoading = !checkoutExtrasReady && !checkoutUnavailable;
  const tillSelected = Boolean(tillId) && tills.some((t) => t.id === tillId);
  const tillReady =
    checkoutExtrasReady &&
    !checkoutUnavailable &&
    tillSelected &&
    openShiftTillIds.includes(tillId);
  const canSubmit = Boolean(
    saleAttemptReady &&
    checkoutExtrasReady &&
    !checkoutUnavailable &&
    cart.length > 0 &&
    fullyPaid &&
    partPaidValid &&
    unpaidValid &&
    dueDateReady &&
    !hasPaymentError &&
    !tenderMalformed &&
    momoReady &&
    discountApprovalReady &&
    tillReady &&
    (!requiresCustomer || customerId) &&
    !(requiresCustomer && customersUnavailable) &&
    (paymentStatus === 'UNPAID' || paymentMethods.length > 0)
  );
  const completeLabel = primaryCheckoutLabel({
    paymentStatus,
    paymentMethods: paymentMethods.length ? paymentMethods : ['CASH'],
    isCompletingSale,
    totalLabel: formatMoney(totalDue, business.currency),
  });
  const checkoutIssues = useMemo(() => {
    const issues: Array<{ tone: 'warning' | 'success'; message: string }> = [];
    if (checkoutLoading) {
      issues.push({ tone: 'warning', message: 'Preparing checkout…' });
    }
    if (checkoutUnavailable) {
      issues.push({ tone: 'warning', message: 'Checkout information could not be loaded. Try refreshing.' });
    }
    if (requiresCustomer && customersUnavailable) {
      issues.push({ tone: 'warning', message: 'Customer list unavailable. Cash sales still work.' });
    }
    if (requiresCustomer && !customerId && !customersUnavailable) {
      issues.push({ tone: 'warning', message: 'Select a customer for credit or part-paid sales.' });
    }
    if (hasPaymentError) {
      issues.push({ tone: 'warning', message: 'Card, transfer, or MoMo cannot exceed the total due.' });
    }
    if (checkoutExtrasReady && !checkoutUnavailable && tills.length === 0) {
      issues.push({ tone: 'warning', message: 'No tills are configured for this store.' });
    } else if (checkoutExtrasReady && !checkoutUnavailable && tills.length > 0 && !tillSelected) {
      issues.push({ tone: 'warning', message: 'Preparing checkout…' });
    } else if (checkoutExtrasReady && !checkoutUnavailable && !tillReady) {
      issues.push({ tone: 'warning', message: 'Open this till shift before recording sales.' });
    }
    if (needsMomoConfirmation && !momoConfirmed) {
      issues.push({ tone: 'success', message: 'MoMo will be recorded manually. Confirm payment on the customer phone before completion.' });
    }
    if (requiresDiscountApproval && !discountApprovalReady) {
      issues.push({ tone: 'warning', message: 'High discount needs manager PIN and reason before completion.' });
    }
    if (paymentStatus === 'PAID' && !fullyPaid) {
      issues.push({ tone: 'warning', message: 'Full payment required. Enter enough cash or switch to Part Paid/Unpaid.' });
    }
    if (paymentStatus === 'PART_PAID' && !partPaidValid) {
      issues.push({ tone: 'warning', message: 'Part-paid sales need an amount greater than zero and below the total.' });
    }
    if (!dueDateReady) {
      issues.push({ tone: 'warning', message: 'Choose a due date or No due date for credit sales.' });
    }
    if (ambiguousFailure) {
      issues.push({ tone: 'warning', message: 'Previous submission was unclear. Confirm before retrying.' });
    }
    if (tenderMalformed) {
      issues.push({ tone: 'warning', message: 'Payment amounts cannot be negative or invalid.' });
    }
    return issues;
  }, [ambiguousFailure, checkoutExtrasReady, checkoutLoading, checkoutUnavailable, customerId, customersUnavailable, discountApprovalReady, dueDateReady, fullyPaid, hasPaymentError, momoConfirmed, needsMomoConfirmation, partPaidValid, paymentStatus, requiresCustomer, requiresDiscountApproval, tenderMalformed, tillReady, tillSelected, tills.length]);
  const primaryCheckoutIssue = checkoutIssues.find((issue) => issue.tone === 'warning') ?? checkoutIssues[0] ?? null;
  const errorParam = searchParams?.get('error');
  const selectedTillName = tills.find((till) => till.id === tillId)?.name ?? null;
  const boundShiftId = openShifts?.find((shift) => shift.tillId === tillId)?.shiftId ?? '';
  const showNoTillBlock =
    checkoutExtrasReady &&
    !checkoutUnavailable &&
    (tills.length === 0 ||
      openShiftTillIds.length === 0 ||
      (tillSelected && !openShiftTillIds.includes(tillId)));
  // Phone empty-cart keeps checkout collapsed via CSS (`max-md:hidden`), not matchMedia.
  const showCheckoutPanel = cartFilled || checkoutUnavailable;
  const closePhoneCheckoutSheet = useCallback(() => {
    if (isCompletingSale) return;
    setPhoneCheckoutSheetOpen(false);
  }, [isCompletingSale]);

  useEffect(() => {
    if (!cartFilled) setPhoneCheckoutSheetOpen(false);
  }, [cartFilled]);

  usePosKeyboardShortcuts({
    activeLineId,
    barcodeRef,
    canSubmit,
    cartLength: cart.length,
    cashRef,
    isCompletingSale,
    lastCartLineId: cart[cart.length - 1]?.id ?? null,
    lastReceiptId,
    productSearchRef,
    onCloseKeyboardHelp: () => setShowKeyboardHelp(false),
    onCompleteSale: handleCompleteSale,
    onOpenParkModal: () => setShowParkModal(true),
    onRemoveLine: removeLine,
    onToggleKeyboardHelp: () => setShowKeyboardHelp((prev) => !prev),
    onUndo: handleUndo,
  });

  usePosScannerBuffer({
    barcodeRef,
    onScan: handleBarcodeScan,
  });

  // Rotate the online idempotency key when the cashier changes the sale identity.
  // Unchanged retries after an ambiguous failure keep the same key.
  // Wait until persisted cart restore finishes so a remount does not treat cart
  // hydration as a cashier edit (which would mint a new attempt id).
  const saleIdentity = useMemo(
    () =>
      JSON.stringify({
        tillId,
        cart,
        customerId,
        paymentStatus,
        paymentMethods,
        cashTendered,
        cardPaid,
        transferPaid,
        momoPaid,
        cardRef,
        transferRef,
        momoRef,
        dueDate,
        dueDateDecision,
      }),
    [
      tillId,
      cart,
      customerId,
      paymentStatus,
      paymentMethods,
      cashTendered,
      cardPaid,
      transferPaid,
      momoPaid,
      cardRef,
      transferRef,
      momoRef,
      dueDate,
      dueDateDecision,
    ],
  );

  useEffect(() => {
    if (!cartHydrated) return;
    if (!saleIdentityRef.current) {
      saleIdentityRef.current = saleIdentity;
      return;
    }
    if (saleIdentityRef.current === saleIdentity || isCompletingSale) return;
    saleIdentityRef.current = saleIdentity;
    setSaleAttemptId(nextSaleAttemptId());
    setAmbiguousFailure(false);
  }, [cartHydrated, isCompletingSale, saleIdentity]);

  return (
    <div
      className={`grid gap-4 lg:grid-cols-[3fr_1fr] lg:items-start lg:gap-6 lg:pb-0 ${
        cartFilled
          ? 'max-md:pb-[calc(var(--pos-mobile-cart-bar-clearance)+1rem)] md:max-lg:pb-[calc(var(--pos-mobile-bottom-clearance)+1rem)]'
          : 'pb-4'
      }`}
      data-pos-mobile-phase="2"
      data-pos-cart={cartFilled ? 'filled' : 'empty'}
      data-selected-till-id={tillId}
      data-selected-shift-id={boundShiftId || undefined}
    >
      <div className="space-y-3 sm:space-y-4">
        {/* ── Scan / Search bar ─────────────────────────────── */}
        <div className="card scroll-mt-[calc(var(--app-header-offset)+0.5rem)] p-3 sm:p-4" data-pos-search-card="true">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <div className="w-full sm:min-w-[200px] sm:flex-1">
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                  <svg className="h-5 w-5 text-black/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                </div>
                <input
                  className="input pl-10 pr-11 text-base font-mono tracking-wider sm:text-lg"
                  ref={barcodeRef}
                  value={barcode}
                  onChange={(event) => setBarcode(event.target.value)}
                  onKeyDown={handleBarcodeKey}
                  onFocus={(event) => event.currentTarget.select()}
                  autoComplete="off"
                  placeholder="Scan barcode…"
                  aria-label="Scan barcode"
                />
                <button
                  type="button"
                  onClick={() => setCameraOpen(true)}
                  className="absolute inset-y-0 right-1 flex min-h-11 min-w-11 items-center justify-center px-1 text-black/40 transition hover:text-accent"
                  title="Scan with camera"
                  aria-label="Scan with camera"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="hidden text-center text-xs font-semibold text-black/30 sm:block">OR</div>

            <div ref={productSearchShellRef} className="relative w-full sm:min-w-[200px] sm:flex-1">
              <div className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center">
                <svg className="h-5 w-5 text-black/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                className="input pl-10 text-base sm:text-lg"
                ref={productSearchRef}
                value={productSearch}
                onChange={(event) => {
                  setProductSearch(event.target.value);
                  setProductDropdownOpen(true);
                  window.requestAnimationFrame(recomputeProductDropdownViewport);
                }}
                onFocus={() => {
                  setProductDropdownOpen(true);
                  window.requestAnimationFrame(recomputeProductDropdownViewport);
                }}
                onBlur={() => {
                  setTimeout(() => setProductDropdownOpen(false), 200);
                }}
                placeholder="Type product name…"
                autoComplete="off"
                aria-label="Search products"
              />
              {productDropdownOpen && productSearch.trim() && (
                <div
                  className={isCompactViewport
                    ? 'fixed inset-x-3 z-40 overflow-auto rounded-2xl border border-black/10 bg-white shadow-2xl'
                    : 'absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-auto rounded-xl border border-black/10 bg-white shadow-xl'
                  }
                  style={isCompactViewport ? { top: productDropdownViewport.top, maxHeight: productDropdownViewport.maxHeight } : undefined}
                >
                  {filteredProducts.length === 0 ? (
                    <div className="px-4 py-4 text-sm text-black/60">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16h8M8 12h8m-8-4h5M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" />
                          </svg>
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-black">No products match &ldquo;{productSearch}&rdquo;</div>
                          <div className="mt-1 text-xs text-black/45">Search across {knownCatalogueSize} products or create a new SKU right away.</div>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                            <button
                              type="button"
                              className="rounded-full bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => { openQuickAdd(); setProductSearch(''); }}
                            >
                              Create new product
                            </button>
                            <span className="hidden rounded-full bg-black/5 px-2.5 py-1 text-black/45 md:inline">F2 returns to barcode</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/5 bg-white/95 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-black/35 backdrop-blur">
                      <span>{productSearchMatches} of {knownCatalogueSize} products</span>
                      <span className="hidden normal-case tracking-normal text-black/35 md:inline">Enter adds • F2 scan</span>
                      <span className="normal-case tracking-normal text-black/35 md:hidden">Tap to add</span>
                    </div>
                    {filteredProducts.map((product) => {
                      const baseUnitId = getProductBaseUnitId(product);
                      const available = getAvailableBase(product.id);
                      const outOfStock = available <= 0;
                      return (
                        <button
                          key={product.id}
                          type="button"
                          disabled={outOfStock}
                          className={`w-full px-4 py-3 text-left transition-colors ${outOfStock ? 'opacity-40 cursor-not-allowed' : 'hover:bg-accentSoft active:bg-blue-100'}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            if (!baseUnitId || outOfStock) return;
                            mergeProductOption(product);
                            if (product.units.length > 1) {
                              // Multiple units — stage for unit selection
                              stageProduct(product);
                              setProductSearch('');
                              setProductDropdownOpen(false);
                            } else {
                              // Single unit — add directly as before
                              addToCart({ productId: product.id, unitId: baseUnitId, qtyInUnit: 1 });
                              setProductId(product.id);
                              setUnitId(baseUnitId);
                              setProductSearch('');
                              setProductDropdownOpen(false);
                              playBeep(true);
                              barcodeRef.current?.focus();
                            }
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-sm truncate">{product.name}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                {product.barcode && (
                                  <span className="text-xs text-black/40 font-mono">{product.barcode}</span>
                                )}
                                {product.categoryName && (
                                  <span className="text-[10px] rounded-full bg-black/5 px-2 py-0.5 text-black/50">{product.categoryName}</span>
                                )}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0 space-y-0.5">
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-black/40">Price</div>
                              <div className="text-sm font-bold text-emerald-700 tabular-nums">
                                {formatMoney(product.sellingPriceBasePence, business.currency)}
                              </div>
                              <div className={`text-[10px] font-semibold uppercase tracking-wide ${outOfStock ? 'text-red-500' : 'text-black/40'}`}>
                                Stock
                              </div>
                              <div className={`text-[11px] tabular-nums ${outOfStock ? 'text-red-600 font-semibold' : 'text-black/55'}`}>
                                {outOfStock ? 'None available' : formatAvailable(product, available)}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              {canUndo && (
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-semibold transition hover:bg-black/5"
                  onClick={handleUndo}
                  title="Undo last action"
                  aria-label="Undo last action"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                className="hidden rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-semibold transition hover:bg-black/5 md:inline-flex"
                onClick={() => setShowKeyboardHelp(true)}
                title="Keyboard shortcuts"
                aria-label="Keyboard help"
                data-pos-desktop-shortcut="keyboard-help"
              >
                  <svg className="h-4 w-4 text-black/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
            </div>
          </div>

          {showOfflineCatalogueLimit({
            catalogueMode: posCatalogueMode ?? urlCatalogueMode,
            catalogueSize: knownCatalogueSize,
          }) ? (
            <p className="mt-2 text-xs text-black/45">{POS_OFFLINE_CATALOGUE_LIMIT_MESSAGE}</p>
          ) : null}

          {barcodeAlert && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900 shadow-sm">
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-200/70 text-amber-700">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <div className="font-semibold">Barcode not found</div>
                  <div className="text-xs text-amber-800/80">{barcodeAlert}</div>
                </div>
              </div>
              <button
                type="button"
                className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-amber-800 ring-1 ring-amber-200 transition hover:bg-amber-100"
                onClick={() => openQuickAdd(pendingScan ?? '')}
              >
                Create product
              </button>
            </div>
          )}
          {nextCustomerReady && cart.length === 0 ? (
            <div className="mt-3 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-900 shadow-sm animate-scale-in">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold" data-testid="pos-ready-next-customer">Ready for next customer</div>
                <div className="text-xs text-emerald-700">Scanner focus is back on the till. Keep serving.</div>
              </div>
                <span className="hidden rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200 md:inline">
                  F2 barcode
                </span>
            </div>
          ) : null}
          {parkedCarts.length > 0 ? (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white px-4 py-3 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700/80">Parked sales ready</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-amber-950">
                    <span className="font-semibold">{parkedCarts.length} sale{parkedCarts.length === 1 ? '' : 's'} waiting</span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                      oldest {oldestParkedCart ? formatRelativeTime(oldestParkedCart.parkedAt) : 'just now'}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-amber-800/80">
                    {latestParkedCart ? `Latest: ${latestParkedCart.label} • ${latestParkedCart.itemCount} item${latestParkedCart.itemCount === 1 ? '' : 's'}` : 'Recall a held basket when the customer returns.'}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {latestParkedCart ? (
                    <button
                      type="button"
                      className="rounded-full bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700"
                      onClick={() => handleRecallParkedCart(latestParkedCart.id)}
                    >
                      Recall latest
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="rounded-full bg-white px-3.5 py-2 text-xs font-semibold text-amber-800 ring-1 ring-amber-200 transition hover:bg-amber-100"
                    onClick={() => setShowParkedPanel((prev) => !prev)}
                  >
                    {showParkedPanel ? 'Hide parked list' : 'View parked list'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {stockAlert && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
              {stockAlert}
            </div>
          )}
        </div>

        {/* ── Staged product: unit + qty picker ──────────────── */}
        {stagedProduct && (
          <div className="card p-4 border-2 border-accent/20 bg-accentSoft/30">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-bold text-ink">{stagedProduct.name}</div>
                <div className="text-xs text-muted">Select how you want to sell</div>
              </div>
              <button
                type="button"
                onClick={() => { clearStagedProduct(); barcodeRef.current?.focus(); }}
                className="text-black/30 hover:text-black/60 text-xl leading-none px-1"
              >
                &times;
              </button>
            </div>
            {/* Unit toggle */}
            <div className="flex flex-wrap gap-2 mb-3">
              {stagedProduct.units.map((u) => {
                const baseU = stagedProduct.units.find((x) => x.isBaseUnit);
                const label = u.conversionToBase > 1
                  ? `${u.name} (${u.conversionToBase} ${baseU?.name ?? 'pcs'})`
                  : u.name;
                const available = getAvailableBase(stagedProduct.id);
                const maxQty = u.conversionToBase > 0 ? Math.floor(available / u.conversionToBase) : available;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setStagedUnitId(u.id)}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${stagedUnitId === u.id
                      ? 'bg-accent text-white shadow-sm'
                      : 'bg-black/5 text-black/60 hover:bg-black/10'
                      }`}
                  >
                    {label}
                    {maxQty <= 5 && <span className="ml-1 text-xs opacity-70">({maxQty} left)</span>}
                  </button>
                );
              })}
            </div>
            {/* Qty + Add */}
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={stagedQty}
                onChange={(e) => setStagedQty(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); handleAddStaged(); }
                  if (e.key === 'Escape') { clearStagedProduct(); barcodeRef.current?.focus(); }
                }}
                className="input w-24 text-center"
                autoFocus
              />
              <button type="button" onClick={handleAddStaged} className="btn-primary flex-1">
                Add to Cart →
              </button>
            </div>
          </div>
        )}

        {/* ── Quick‑add product (collapsed by default) ──────── */}
        {quickAddOpen && (
          <QuickAddPanel
            units={safeUnits}
            initialBarcode={quickAddBarcode}
            pendingScan={pendingScan}
            onCreated={handleQuickCreated}
            onCancel={handleQuickCancel}
          />
        )}

        {/* ── Cart ──────────────────────────────────────────── */}
        <form
          onSubmit={(e) => {
            // Enter inside inputs must not complete the sale — only Ctrl+Enter / explicit CTA.
            e.preventDefault();
          }}
          className="space-y-4"
          ref={formRef}
        >

          {/* Success toast */}
          {saleSuccess && (
            saleSuccess.transactionNumber === '(Queued offline)'
              ? (
                /* Offline queued — amber reassurance banner */
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-4 text-white shadow-lg animate-scale-in">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white/20">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                        </svg>
                      </div>
                      <div>
                        <div className="font-semibold">Saved offline &mdash; {formatMoney(saleSuccess.totalPence, business.currency)}</div>
                        <div className="text-xs opacity-90 mt-0.5">No connection. This sale will sync automatically when you&apos;re back online.</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="rounded-lg bg-white/10 px-2 py-1.5 text-xs hover:bg-white/20 transition flex-shrink-0"
                      onClick={dismissSaleSuccess}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )
              : (
                /* Online success — blue celebration banner */
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-accent to-accent/80 px-4 py-4 text-white shadow-lg animate-scale-in">
                  {/* Confetti dots */}
                  <span className="confetti-dot" style={{ left: '30%', top: '50%' }} />
                  <span className="confetti-dot" style={{ left: '50%', top: '50%' }} />
                  <span className="confetti-dot" style={{ left: '70%', top: '50%' }} />
                  <span className="confetti-dot" style={{ left: '40%', top: '50%' }} />
                  <span className="confetti-dot" style={{ left: '60%', top: '50%' }} />
                  <span className="confetti-dot" style={{ left: '80%', top: '50%' }} />
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="success-ring flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" className="animate-check-draw" />
                        </svg>
                      </div>
                      <div>
                        <div className="font-semibold" data-testid="pos-sale-complete">Sale Complete!</div>
                        <div className="text-sm opacity-90">{formatMoney(saleSuccess.totalPence, business.currency)}</div>
                        <div className="text-xs opacity-60 font-mono mt-0.5">TXN&nbsp;{saleSuccess.transactionNumber ?? `#${saleSuccess.receiptId.slice(0, 8).toUpperCase()}`}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded-lg bg-white/20 px-3 py-1.5 text-xs font-semibold hover:bg-white/30 transition"
                        onClick={() => window.open(`/receipts/${saleSuccess.receiptId}`, '_blank', 'noopener')}
                      >
                        Print Receipt
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-white/10 px-2 py-1.5 text-xs hover:bg-white/20 transition"
                        onClick={dismissSaleSuccess}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              )
          )}

          {/* Sale error — stay on the page when the phone sheet is closed; open sheet owns its own banner. */}
          {saleError && !(cartFilled && phoneCheckoutSheetOpen) ? (
            <div
              className="rounded-lg border border-rose/40 bg-rose/10 px-3 py-2 text-sm text-rose flex items-center justify-between"
              role="alert"
              data-pos-sale-error="true"
            >
              <span>{saleError}</span>
              <button type="button" className="text-xs font-semibold ml-2" onClick={dismissSaleError}>✕</button>
            </div>
          ) : null}

          {errorParam ? (
            <div className="rounded-lg border border-rose/40 bg-rose/10 px-3 py-2 text-sm text-rose">
              {errorParam === 'customer-required'
                ? 'Select a customer for credit or part-paid sales.'
                : errorParam === 'insufficient-stock'
                  ? 'One or more items exceed available stock.'
                  : errorParam === 'till-not-open'
                    ? 'Open the till shift first before recording sales.'
                    : errorParam === 'invalid-discount-pin'
                      ? 'Manager PIN for discount override is invalid.'
                      : errorParam === 'invalid-discount-reason'
                        ? 'Discount reason code is invalid.'
                        : 'Unable to complete sale. Please review the form.'}
            </div>
          ) : null}

          {showNoTillBlock ? (
            <div
              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-950 shadow-sm"
              role="alert"
              data-pos-till-block="true"
            >
              <div className="font-semibold">
                {tills.length === 0 ? 'No tills are configured for this store' : 'Open a till before completing sales'}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-rose-900/80">
                {tills.length === 0
                  ? 'Ask an owner or manager to configure a till for this store.'
                  : 'Sales stay blocked until a till shift is open. Open or select a till, then return here.'}
              </p>
              {tills.length > 0 ? (
                <Link
                  href="/shifts"
                  className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl bg-rose-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-800"
                >
                  Open till
                </Link>
              ) : null}
            </div>
          ) : null}

          {(() => {
            const activeSalePanel = (
              <>
          <div className="card overflow-hidden" data-pos-cart-card="true">
            <div className="flex items-center justify-between border-b border-black/5 px-3 py-2.5 sm:px-4 sm:py-3">
              <div className="flex items-center gap-3">
                <svg className="h-5 w-5 text-black/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span className="text-sm font-semibold">Cart</span>
                <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-bold text-black/50">{cartDetails.length}</span>
              </div>
              <div className="flex items-center gap-3">
                {cartRestored && (
                  <span className="text-xs font-medium text-accent">Restored from last session</span>
                )}
                {cart.length > 0 && (
                  <button
                    type="button"
                    className="text-xs font-medium text-rose-500 hover:text-rose-700"
                    onClick={() => { if (confirm('Clear the entire cart?')) { pushUndo(cart); setCart([]); clearSavedCart(); } }}
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>

            {cartDetails.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center px-3 py-4 text-center md:py-12"
                data-pos-empty-cart="true"
              >
                  <div className="mb-3 hidden rounded-full bg-black/5 p-4 md:block">
                    <svg className="h-8 w-8 text-black/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                  </div>
                <div className="text-sm font-semibold text-black/60 md:hidden">Cart is empty</div>
                <div className="hidden text-sm font-semibold text-black/60 md:block">Scan a barcode or search a product</div>
                  <div className="mt-1 hidden text-xs text-black/35 md:block">
                    This till is clear and ready. Items will appear here instantly.
                  </div>
                  <div className="mt-4 hidden flex-wrap items-center justify-center gap-2 md:flex" data-pos-desktop-empty-actions="true">
                    <button
                      type="button"
                      className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/60 transition hover:bg-black/5"
                      onClick={() => barcodeRef.current?.focus()}
                      data-pos-desktop-shortcut="f2-focus-barcode"
                    >
                      F2 focus barcode
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/60 transition hover:bg-black/5"
                      onClick={() => setShowKeyboardHelp(true)}
                      data-pos-desktop-shortcut="keyboard-help"
                    >
                      ? keyboard help
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                      onClick={() => setCameraOpen(true)}
                    >
                      Scan with camera
                    </button>
                  </div>
              </div>
            ) : (
              <div
                className="max-h-none divide-y divide-black/5 scroll-smooth md:max-h-[38vh] md:overflow-y-auto lg:max-h-[45vh]"
              >
                {cartDetails.map((line, index) => {
                  const isActive = activeLineId === line.id;
                  const availBase = availableBaseMap.get(line.productId) ?? getAvailableBase(line.productId, line.id);
                  return (
                    <div
                      key={line.id}
                      className={`px-4 py-3 transition-colors ${isActive ? 'bg-accentSoft/50' : 'hover:bg-black/[.02]'}`}
                      onClick={() => setActiveLineId(line.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-black/5 text-xs font-bold text-black/40">
                          {index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm truncate">{line.product.name}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2">
                            <span className="text-xs text-black/40">{formatMoney(line.unitPrice, business.currency)} × {line.unit.name}</span>
                            {line.promoLabel && <span className="text-[10px] text-emerald-600 font-medium">{line.promoLabel}</span>}
                            {(line.lineDiscount > 0) && <span className="text-[10px] text-rose-500">-{formatMoney(line.lineDiscount, business.currency)}</span>}
                            {availBase <= 10 && (
                              <span className={`text-[10px] font-semibold ${availBase <= 3 ? 'text-rose-500' : 'text-amber-500'}`}>
                                {availBase <= 0 ? 'Out of stock' : `${availBase} left`}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="flex-shrink-0 rounded-lg p-3 text-black/20 hover:text-rose-500 hover:bg-rose-50 transition"
                          onClick={(e) => { e.stopPropagation(); removeLine(line.id); }}
                          title="Remove"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 sm:mt-2 sm:flex-nowrap">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="flex h-11 w-11 items-center justify-center rounded-lg border border-black/10 bg-white text-lg font-bold hover:bg-black/5 transition"
                            onClick={(e) => {
                              e.stopPropagation();
                              decrementLineQty(line);
                            }}
                          >
                            −
                          </button>
                          <input
                            className="input w-16 px-2 py-2 text-center text-base font-bold sm:w-14"
                            type="number"
                            min={0}
                            step={1}
                            inputMode="numeric"
                            value={qtyDrafts[line.id] ?? String(line.qtyInUnit)}
                            onChange={(e) => setQtyDrafts((prev) => ({ ...prev, [line.id]: e.target.value }))}
                            onBlur={() => commitLineQty(line)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitLineQty(line); } }}
                            onFocus={(e) => { setActiveLineId(line.id); e.currentTarget.select(); }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <button
                            type="button"
                            className="flex h-11 w-11 items-center justify-center rounded-lg border border-black/10 bg-white text-lg font-bold hover:bg-black/5 transition"
                            onClick={(e) => {
                              e.stopPropagation();
                              incrementLineQty(line);
                            }}
                          >
                            +
                          </button>
                        </div>
                        <div className="ml-auto text-right sm:min-w-[5rem]">
                          <div className="text-sm font-bold">{formatMoney(line.total, business.currency)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Inline discount for selected line ────────────── */}
          {activeLineId && cartDetails.find((l) => l.id === activeLineId) && (
            <div className="card p-3">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="text-xs text-black/40 font-semibold uppercase">Line discount</span>
                <select
                  className="input py-1 text-sm w-24"
                  value={cartDetails.find((l) => l.id === activeLineId)?.discountType ?? 'NONE'}
                  onChange={(e) => {
                    const nextType = e.target.value as DiscountType;
                    setLineDiscountType(activeLineId, nextType);
                  }}
                >
                  <option value="NONE">None</option>
                  <option value="PERCENT">%</option>
                  <option value="AMOUNT">Fixed</option>
                </select>
                {(() => {
                  const activeLine = cartDetails.find((l) => l.id === activeLineId);
                  if (!activeLine || !activeLine.discountType || activeLine.discountType === 'NONE') return null;
                  return (
                    <input
                      className="input py-1 text-sm w-24"
                      type="number"
                      min={0}
                      step={activeLine.discountType === 'PERCENT' ? '1' : '0.01'}
                      inputMode="decimal"
                      value={activeLine.discountValue ?? ''}
                      onChange={(e) => setLineDiscountValue(activeLineId, e.target.value)}
                      onFocus={(e) => e.currentTarget.select()}
                      placeholder={activeLine.discountType === 'PERCENT' ? '10' : '0.00'}
                    />
                  );
                })()}
                {selectedUnits.length > 1 && (
                  <>
                    <span className="text-xs text-black/40 font-semibold uppercase ml-2">Unit</span>
                    <select
                      className="input py-1 text-sm w-28"
                      value={cartDetails.find((l) => l.id === activeLineId)?.unitId ?? ''}
                      onChange={(e) => {
                        const newUnitId = e.target.value;
                        changeLineUnit(activeLineId, newUnitId);
                      }}
                    >
                      {(cartDetails.find((l) => l.id === activeLineId)?.product.units ?? []).map((u) => (
                        <option key={u.id} value={u.id}>{u.name} ({u.conversionToBase}x)</option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Compact checkout ─────────────────────────────── */}
          <div
            className={`card scroll-mt-[calc(var(--app-header-offset)+0.75rem)] space-y-3 p-3 sm:p-4 lg:pb-4 ${
              cartFilled ? 'md:max-lg:pb-[calc(1rem+env(safe-area-inset-bottom,0px)+5.5rem)]' : 'pb-3'
            }`}
            data-pos-checkout-card="true"
          >
            <div
              className={
                checkoutLoading
                  ? 'inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600 md:grid md:w-full md:max-w-none md:grid-cols-[minmax(0,12rem)_1fr] md:items-end md:gap-3 md:rounded-none md:border-0 md:bg-transparent md:p-0 md:text-sm'
                  : tillReady
                    ? 'flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 md:grid md:w-full md:grid-cols-[minmax(0,12rem)_1fr] md:items-end md:gap-3 md:rounded-none md:border-0 md:bg-transparent md:p-0'
                    : 'grid gap-3 sm:grid-cols-[minmax(0,12rem)_1fr] sm:items-end'
              }
              data-pos-till-form="expanded"
              data-pos-till-compact={checkoutLoading ? 'loading' : tillReady ? 'ready' : undefined}
              data-checkout-state={checkoutLoading ? 'loading' : tillReady ? 'ready' : undefined}
            >
              {checkoutLoading ? (
                <span
                  className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-accent motion-reduce:animate-none md:hidden"
                  aria-hidden="true"
                />
              ) : tillReady ? (
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-600 md:hidden" aria-hidden="true" />
              ) : null}
              {checkoutLoading ? (
                <span className="md:hidden">Preparing checkout…</span>
              ) : tillReady ? (
                <span className="text-xs font-semibold text-emerald-900 md:hidden">
                  {selectedTillName ?? 'Till'} · Open
                </span>
              ) : null}
              <div className={checkoutLoading || tillReady ? 'max-md:ml-auto max-md:max-w-[10rem]' : undefined}>
                <label className={`label ${checkoutLoading || tillReady ? 'max-md:sr-only' : ''}`} htmlFor="pos-till-select">Till</label>
                <select
                  id="pos-till-select"
                  className={checkoutLoading || tillReady ? 'input max-md:py-1.5 max-md:text-xs' : 'input'}
                  name="tillId"
                  value={tillId}
                  disabled={checkoutLoading || checkoutUnavailable || tills.length === 0}
                  onChange={(e) => setTillId(e.target.value)}
                  aria-busy={checkoutLoading || undefined}
                  data-checkout-till-state={
                    checkoutLoading
                      ? 'loading'
                      : checkoutUnavailable
                        ? 'failed'
                        : tills.length === 0
                          ? 'empty'
                          : tillReady
                            ? 'ready'
                            : 'closed'
                  }
                  data-pos-till-id={tillId || undefined}
                  data-pos-shift-id={boundShiftId || undefined}
                >
                  {checkoutLoading ? (
                    <option value="">Preparing checkout…</option>
                  ) : checkoutUnavailable ? (
                    <option value="">Checkout unavailable</option>
                  ) : tills.length === 0 ? (
                    <option value="">No tills configured</option>
                  ) : (
                    tills.map((till) => (
                      <option key={till.id} value={till.id}>
                        {till.name}
                      </option>
                    ))
                  )}
                </select>
                {checkoutLoading ? (
                  <div className="mt-1 hidden text-xs text-slate-600 md:block" data-checkout-state="loading">
                    Preparing checkout…
                  </div>
                ) : checkoutUnavailable ? (
                  <div className="mt-1 text-xs text-rose" data-checkout-state="failed">
                    Checkout information could not be loaded
                  </div>
                ) : tills.length === 0 ? (
                  <div className="mt-1 text-xs text-amber-800" data-checkout-state="empty">
                    No tills are configured for this store
                  </div>
                ) : (
                  <div
                    className={`mt-1 hidden text-xs md:block ${tillReady ? 'text-emerald-700' : 'text-rose'}`}
                    data-checkout-state={tillReady ? 'ready' : 'closed'}
                  >
                    {tillReady ? 'Till is open' : 'Till is not open'}
                  </div>
                )}
              </div>
              <details className={`rounded-xl border border-black/10 bg-black/[.02] px-3 py-2 ${cartFilled ? '' : 'max-md:hidden'}`}>
                <summary className="cursor-pointer text-xs font-semibold text-black/55">
                  Order discount {orderDiscountType !== 'NONE' ? '· active' : ''}
                </summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_9rem] sm:items-end">
                    <select
                      className="input w-full"
                      value={orderDiscountType}
                      onChange={(e) => orderDiscountForm.setType(e.target.value as DiscountType)}
                    >
                      <option value="NONE">None</option>
                      <option value="PERCENT">%</option>
                      <option value="AMOUNT">Amount</option>
                    </select>
                    <input
                      className="input w-full"
                      type="number"
                      min={0}
                      step={orderDiscountType === 'PERCENT' ? '1' : '0.01'}
                      inputMode="decimal"
                      value={orderDiscountInput}
                      onChange={(e) => orderDiscountForm.setInput(e.target.value)}
                      disabled={orderDiscountType === 'NONE'}
                      onFocus={(e) => e.currentTarget.select()}
                      placeholder={orderDiscountType === 'PERCENT' ? '10' : '0.00'}
                    />
                </div>
                  {requiresDiscountApproval ? (
                    <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                        Manager Approval Required
                      </div>
                      <div className="mt-1 text-xs text-amber-700">
                        Discount is {(discountBps / 100).toFixed(2)}% and exceeds threshold{' '}
                        {((business.discountApprovalThresholdBps ?? 1500) / 100).toFixed(2)}%.
                      </div>
                      <div className="mt-3 grid gap-2 md:grid-cols-3">
                        <select
                          className="input"
                          value={discountReasonCode}
                          onChange={(e) => orderDiscountForm.setReasonCode(e.target.value)}
                        >
                          <option value="">Select reason code</option>
                          {DISCOUNT_REASON_CODES.map((code) => (
                            <option key={code} value={code}>
                              {code.replace(/_/g, ' ')}
                            </option>
                          ))}
                        </select>
                        <input
                          className="input"
                          value={discountReason}
                          onChange={(e) => orderDiscountForm.setReason(e.target.value)}
                          placeholder="Reason details"
                        />
                        <input
                          className="input"
                          type="password"
                          value={discountManagerPin}
                          onChange={(e) => orderDiscountForm.setManagerPin(e.target.value)}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="Manager PIN"
                        />
                      </div>
                    </div>
                  ) : null}
              </details>
            </div>

            <div data-pos-checkout-full="true" className={showCheckoutPanel ? undefined : 'max-md:hidden'}>
            <CustomerSelector
              requiresCustomer={requiresCustomer}
              customerId={customerId}
              customerOptions={customerOptions}
              customerSearch={customerSearch}
              customerSearchError={customerSearchError}
              onCustomerSearchChange={setCustomerSearch}
              onCustomerChange={setCustomerId}
              onQuickAdd={() => setShowQuickCustomer(true)}
            />
            {requiresCustomer || customerId ? (
              <CustomerCreditWarning
                customerId={customerId}
                totalDuePence={totalDue}
                currency={business.currency}
              />
            ) : null}

            {loyaltyRedemption.active ? (
              <LoyaltyRedemptionPanel
                currency={business.currency}
                pointsBalance={selectedCustomer?.loyaltyPointsBalance ?? 0}
                pointsInput={loyaltyRedemption.pointsInput}
                maxPoints={loyaltyRedemption.maxPoints}
                pointsToRedeem={loyaltyRedemption.pointsToRedeem}
                discountPence={loyaltyRedemption.loyaltyDiscountPence}
                pesewasPerHundredPoints={business.loyaltyGhsPerHundredPoints ?? 100}
                onPointsInputChange={loyaltyRedemption.setPointsInput}
                onApplyMax={loyaltyRedemption.applyMax}
              />
            ) : null}

            <PosCheckoutPanel
              currency={business.currency}
              paymentStatus={paymentStatus}
              onPaymentStatusChange={handlePaymentStatusChange}
              availablePaymentMethods={availablePaymentMethods}
              paymentMethods={paymentMethods}
              onTogglePaymentMethod={togglePaymentMethod}
              showSplitPanel={showSplitPanel}
              onToggleSplitPanel={handleToggleSplitPanel}
              cashTendered={cashTendered}
              onCashTenderedChange={setCashTendered}
              cashRef={cashRef}
              cardPaid={cardPaid}
              onCardPaidChange={setCardPaid}
              transferPaid={transferPaid}
              onTransferPaidChange={setTransferPaid}
              momoPaid={momoPaid}
              onMomoPaidChange={setMomoPaid}
              cardRefValue={cardRef}
              onCardRefChange={setCardRef}
              transferRefValue={transferRef}
              onTransferRefChange={setTransferRef}
              momoRef={momoRef}
              onMomoRefChange={setMomoRef}
              momoNetwork={momoNetwork}
              onMomoNetworkChange={setMomoNetwork}
              momoPayerMsisdn={momoPayerMsisdn}
              onMomoPayerMsisdnChange={setMomoPayerMsisdn}
              momoGuidance={momoGuidance}
              totalDue={totalDue}
              totalPaid={totalPaid}
              balanceRemaining={balanceRemaining}
              changeDue={changeDue}
              dueDateDecision={dueDateDecision}
              dueDate={dueDate}
              onDueDateDecisionChange={(decision) => {
                setDueDateDecision(decision);
                if (decision !== 'date') setDueDate('');
              }}
              onDueDateChange={(value) => {
                setDueDate(value);
                setDueDateDecision(value ? 'date' : 'unset');
              }}
              showAmountInputs
              compactDenominations={totalDue <= 0}
            />
            </div>
            {showCheckoutPanel ? null : (
              <div
                className="rounded-xl border border-black/5 bg-black/[.02] px-3 py-2 text-xs text-black/55 md:hidden"
                data-pos-checkout-collapsed="true"
              >
                Paid · Cash ready — add an item to open checkout.
              </div>
            )}

            {checkoutIssues.length > 0 ? (
              <div className="space-y-1.5">
                {checkoutIssues.map((issue) => (
                  <div
                    key={issue.message}
                    className={`rounded-xl px-3 py-2 text-xs font-medium ${
                      issue.tone === 'success'
                        ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200'
                        : 'bg-amber-50 text-amber-900 ring-1 ring-amber-200'
                    }`}
                  >
                    {issue.tone === 'success' ? '✓ ' : '• '}{issue.message}
                  </div>
                ))}
              </div>
            ) : cart.length > 0 ? (
              <div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200">
                ✓ Ready — {activePaymentMethodLabels.join(' + ')}
              </div>
            ) : null}

            <div className="flex flex-col gap-2 md:flex-row">
              <button
                className={`btn-primary hidden flex-1 py-3 text-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:inline-flex md:items-center md:justify-center ${
                  paymentStatus !== 'PAID' ? 'bg-amber-600 hover:bg-amber-700' : ''
                }`}
                type="button"
                data-testid="pos-complete-checkout"
                disabled={!canSubmit || isCompletingSale}
                onClick={handleCompleteSale}
              >
                {completeLabel}
              </button>
              {cartFilled ? (
                <button
                  type="button"
                  className="hidden w-full items-center justify-center gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 md:flex md:w-auto"
                  onClick={() => setShowParkModal(true)}
                  title="Park this sale and serve another customer"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  <span>Park Sale</span>
                </button>
              ) : null}
            </div>
          </div>
              </>
            );
            return (
              <>
                <div className={cartFilled ? 'max-md:hidden' : undefined}>
                  {phoneCheckoutSheetOpen ? null : activeSalePanel}
                </div>
                {cartFilled ? (
                  <div className="md:hidden">
                  <PosMobileCartCheckoutSheet
                    open={phoneCheckoutSheetOpen}
                    onClose={closePhoneCheckoutSheet}
                    dismissible={!isCompletingSale}
                    banner={
                      saleError ? (
                        <div
                          className="mt-2 flex items-center justify-between rounded-lg border border-rose/40 bg-rose/10 px-3 py-2 text-sm text-rose"
                          role="alert"
                          data-pos-mobile-sheet-sale-error="true"
                        >
                          <span>{saleError}</span>
                          <button
                            type="button"
                            className="ml-2 text-xs font-semibold"
                            onClick={dismissSaleError}
                          >
                            ✕
                          </button>
                        </div>
                      ) : null
                    }
                    footer={
                      <div className="space-y-2" data-pos-mobile-sheet-footer="true">
                        <div
                          className={`rounded-2xl px-3 py-2 text-xs font-medium ${
                            canSubmit
                              ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
                              : 'bg-amber-50 text-amber-900 ring-1 ring-amber-200'
                          }`}
                        >
                          {canSubmit
                            ? `Ready to complete • ${activePaymentMethodLabels.join(' + ')} • ${formatMoney(totalDue, business.currency)}`
                            : primaryCheckoutIssue?.message ??
                              `Review checkout before completing this ${formatMoney(totalDue, business.currency)} sale.`}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
                            onClick={() => setShowParkModal(true)}
                            disabled={isCompletingSale}
                            title="Park this sale"
                          >
                            Park
                          </button>
                          <button
                            type="button"
                            data-testid="pos-complete-sheet"
                            className={`btn-primary flex-1 px-5 py-3 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                              paymentStatus !== 'PAID' ? 'bg-amber-600 hover:bg-amber-700' : ''
                            }`}
                            disabled={!canSubmit || isCompletingSale}
                            onClick={handleCompleteSale}
                          >
                            {completeLabel}
                          </button>
                        </div>
                      </div>
                    }
                  >
                    {phoneCheckoutSheetOpen ? activeSalePanel : null}
                  </PosMobileCartCheckoutSheet>
                  </div>
                ) : null}
              </>
            );
          })()}
        </form>

        {/* Park modal */}
        {showParkModal && (
          <ParkModal
            itemCount={cart.length}
            onPark={(label) => { handleParkCurrentCart(label); setShowParkModal(false); }}
            onClose={() => setShowParkModal(false)}
          />
        )}
      </div>

      {/* ── Summary sidebar (hidden on mobile — use sticky bottom bar) ── */}
      <div
        className="app-desktop-sidebar-sticky hidden lg:block lg:h-fit lg:self-start"
        style={{
          position: 'sticky',
          top: 'calc(var(--app-header-offset-desktop) + 0.5rem)',
          maxHeight: 'calc(100dvh - var(--app-header-offset-desktop) - 0.5rem)',
          overflowY: 'auto',
          paddingRight: '0.25rem',
        }}
      >
        <SummarySidebar
          business={business}
          store={store}
          cartItemCount={cartDetails.length}
          totals={totals}
          orderDiscount={orderDiscount}
          vatTotal={vatTotal}
          totalDue={totalDue}
          totalPaid={totalPaid}
          balanceRemaining={balanceRemaining}
          cashTenderedValue={cashTenderedValue}
          changeDue={changeDue}
          hasCash={hasMethod('CASH')}
          lastReceiptId={lastReceiptId}
          parkedCarts={parkedCarts}
          showParkedPanel={showParkedPanel}
          onToggleParkedPanel={() => setShowParkedPanel(!showParkedPanel)}
          onRecallParked={(id) => { handleRecallParkedCart(id); setShowParkedPanel(false); }}
          onDeleteParked={deleteParkedCart}
          completeLabel={completeLabel}
          canSubmit={canSubmit}
          isCompletingSale={isCompletingSale}
          onCompleteSale={handleCompleteSale}
        />
      </div>

      <KeyboardHelpModal
        show={showKeyboardHelp}
        onClose={() => setShowKeyboardHelp(false)}
      />
      {showQuickCustomer ? (
        <QuickAddCustomer
          currency={business.currency}
          onCreated={(customer) => {
            addCustomerOption(customer);
            setCustomerId(customer.id);
            setShowQuickCustomer(false);
          }}
          onClose={() => setShowQuickCustomer(false)}
        />
      ) : null}

      <CameraScanner
        open={cameraOpen}
        onScan={(code) => {
          setCameraOpen(false);
          handleBarcodeScan(code);
        }}
        onClose={() => setCameraOpen(false)}
      />

      {showParkedPanel && parkedCarts.length > 0 ? (
        <div
          className={`fixed inset-x-4 z-20 max-h-[45vh] overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-2xl lg:hidden hide-when-keyboard-open ${
            cartFilled
              ? 'bottom-[calc(env(safe-area-inset-bottom,0px)+var(--keyboard-safe-bottom)+7rem)] max-md:bottom-[calc(env(safe-area-inset-bottom,0px)+var(--keyboard-safe-bottom)+var(--pos-mobile-cart-bar-clearance))]'
              : 'bottom-[calc(env(safe-area-inset-bottom,0px)+var(--keyboard-safe-bottom)+7rem)]'
          }`}
          data-pos-parked-panel="true"
        >
          <div className="flex items-center justify-between border-b border-amber-100 bg-amber-50 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-amber-800">Parked Sales</div>
              <div className="text-[11px] text-amber-700/80">Tap a basket to recall it without losing your place.</div>
            </div>
            <button
              type="button"
              className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200"
              onClick={() => setShowParkedPanel(false)}
            >
              Close
            </button>
          </div>
          <div className="max-h-[calc(45vh-4rem)] divide-y divide-black/5 overflow-y-auto overscroll-contain bg-white">
            {parkedCarts.map((parked) => (
              <div key={parked.id} className="space-y-2 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-black/80">{parked.label}</span>
                  <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-semibold text-black/45">{formatRelativeTime(parked.parkedAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs text-black/50">
                  <span>{parked.itemCount} item{parked.itemCount !== 1 ? 's' : ''}</span>
                  <span>{new Date(parked.parkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                </div>
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 transition hover:bg-emerald-100"
                    onClick={() => { handleRecallParkedCart(parked.id); setShowParkedPanel(false); }}
                  >
                    Recall
                  </button>
                  <button
                    type="button"
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 ring-1 ring-rose-200 transition hover:bg-rose-50"
                    onClick={() => deleteParkedCart(parked.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Phone cart bar (Phase 2) — CSS-hidden from md up ─ */}
      {cartFilled ? (
        <div className="md:hidden">
          {parkedCarts.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowParkedPanel((prev) => !prev)}
              className="fixed right-3 z-30 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-700 shadow-sm lg:hidden"
              style={{
                bottom:
                  'calc(env(safe-area-inset-bottom, 0px) + var(--keyboard-safe-bottom) + var(--pos-mobile-cart-bar-clearance) + 0.35rem)',
              }}
              data-pos-mobile-parked-chip="true"
            >
              {parkedCarts.length} parked
            </button>
          ) : null}
          <PosMobileCartBar
            ref={mobileCartBarRef}
            itemCount={cartDetails.length}
            totalPence={totalDue}
            currency={business.currency}
            onOpen={() => setPhoneCheckoutSheetOpen(true)}
          />
        </div>
      ) : null}

      {/* ── Tablet sticky checkout (Phase 1; phone uses sheet) ─ */}
      {cartFilled ? (
        <div
          className="fixed inset-x-0 z-30 hidden border-t border-black/10 bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] shadow-[0_-4px_20px_rgba(0,0,0,0.08)] keyboard-safe-fixed-bottom md:block lg:hidden"
          data-pos-mobile-checkout-bar="true"
        >
          <div className="space-y-3">
            <div className={`rounded-2xl px-3 py-2 text-xs font-medium ${canSubmit ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : 'bg-amber-50 text-amber-900 ring-1 ring-amber-200'}`}>
              {canSubmit
                ? `Ready to complete • ${activePaymentMethodLabels.join(' + ')} • ${formatMoney(totalDue, business.currency)}`
                : primaryCheckoutIssue?.message ?? `Review checkout before completing this ${formatMoney(totalDue, business.currency)} sale.`}
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-black/50">{cartDetails.length} item{cartDetails.length !== 1 ? 's' : ''}</div>
                <div className="text-lg font-bold text-ink truncate">{formatMoney(totalDue, business.currency)}</div>
                <div className="text-[11px] text-black/45">
                  {balanceRemaining > 0 ? `Balance ${formatMoney(balanceRemaining, business.currency)}` : changeDue > 0 ? `Change ${formatMoney(changeDue, business.currency)}` : 'Fully covered'}
                </div>
              </div>
              {parkedCarts.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowParkedPanel((prev) => !prev)}
                  className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-700"
                >
                  {parkedCarts.length} parked
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {!canSubmit ? (
                <button
                  type="button"
                  className="rounded-xl border border-accent/20 bg-accentSoft px-3 py-3 text-xs font-semibold text-accent transition hover:bg-accent/10"
                  onClick={() => {
                    const paymentPanel = document.getElementById('pos-payment-panel');
                    paymentPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    paymentPanel?.focus({ preventScroll: true });
                  }}
                >
                  Review
                </button>
              ) : null}
              <button
                type="button"
                className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                onClick={() => setShowParkModal(true)}
                title="Park this sale"
              >
                Park
              </button>
              <button
                type="button"
                className={`btn-primary flex-1 px-5 py-3 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  paymentStatus !== 'PAID' ? 'bg-amber-600 hover:bg-amber-700' : ''
                }`}
                disabled={!canSubmit || isCompletingSale}
                onClick={handleCompleteSale}
              >
                {completeLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
