'use client';

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { formatMoney } from '@/lib/format';
import { useParkedCarts } from '@/hooks/useParkedCarts';
import { usePersistedPosCart } from '@/hooks/usePersistedPosCart';
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
import { getProductBaseUnitId, resolveBarcodeScan } from '@/lib/payments/pos-barcode';
import { applyOptimisticStock, buildOfflinePayments, buildOptimisticStockDecrements, createSaleCompletionSnapshot, type PosCompletionSnapshot } from '@/lib/payments/pos-completion';
import { calculateCheckoutSummary } from '@/lib/payments/pos-checkout';
import { buildAvailableBaseMap, buildCartDetails, buildProductMap, formatAvailable, getAvailableBase as getAvailableBaseForCart, getUnitFromProduct, sumCartTotals } from '@/lib/payments/pos-cart';
import { filterPosProducts } from '@/lib/payments/pos-search';
import { completeSaleAction } from '@/app/actions/sales';
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

type UnitDto = {
  id: string;
  name: string;
  pluralName: string;
  conversionToBase: number;
  isBaseUnit: boolean;
};

type ProductDto = {
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
  units: UnitDto[];
  onHandBase: number;
};

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
  };
  store: { id: string; name: string };
  tills: { id: string; name: string }[];
  openShiftTillIds: string[];
  products: ProductDto[];
  customers: PosCustomerOption[];
  units: { id: string; name: string }[];
  categories: CategoryDto[];
};

type CartLine = {
  id: string;
  productId: string;
  unitId: string;
  qtyInUnit: number;
  discountType?: DiscountType;
  discountValue?: string;
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
  products,
  customers,
  units,
  categories,
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
    // Priority 1: explicit URL param (allows deep-link to a specific till)
    const urlTillId = searchParams.get('tillId');
    if (urlTillId && tills.some((t) => t.id === urlTillId)) return urlTillId;
    // Priority 2: till with an open shift (when exactly one is open)
    if (openShiftTillIds.length === 1 && tills.some((t) => t.id === openShiftTillIds[0])) {
      return openShiftTillIds[0];
    }
    // Priority 3: first till (fallback — localStorage override happens in useEffect after mount)
    return tills[0]?.id ?? '';
  });
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(['CASH']);
  const [cashTendered, setCashTendered] = useState('');
  const [cardPaid, setCardPaid] = useState('');
  const [transferPaid, setTransferPaid] = useState('');
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
    clearSavedCart,
  } = usePersistedPosCart<CartLine>({
    productExists,
    customerExists,
    cartStorageKey,
    customerStorageKey,
  });

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

  // Restore saved till from localStorage on mount (skipped when URL param already set)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlTillId = searchParams.get('tillId');
    if (urlTillId) return; // URL param takes precedence
    const saved = window.localStorage.getItem(tillStorageKey);
    if (saved && tills.some((t) => t.id === saved)) {
      setTillId(saved);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tillStorageKey]);

  // Persist till selection to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined' && tillId) {
      window.localStorage.setItem(tillStorageKey, tillId);
    }
  }, [tillId, tillStorageKey]);

  const resetActiveSale = useCallback((options?: { resetPaymentStatus?: boolean; playSuccessTone?: boolean }) => {
    setCart([]);
    clearSavedCart();
    setCustomerId('');
    setCashTendered('');
    setCardPaid('');
    setTransferPaid('');
    resetMomoPaymentFields();
    setPaymentMethods(['CASH']);
    orderDiscountForm.reset();
    setQtyDrafts({});
    clearUndoStack();
    if (options?.resetPaymentStatus) {
      setPaymentStatus('PAID');
    }
    if (options?.playSuccessTone) {
      playBeep(true);
    }
  }, [
    clearSavedCart,
    clearUndoStack,
    orderDiscountForm,
    playBeep,
    resetMomoPaymentFields,
    setCart,
    setCustomerId,
  ]);

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
    setSaleError,
  ]);

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
    beginCompletion();

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

    // Optimistic: decrement stock in local state immediately for instant feedback
    const stockDecrements = buildOptimisticStockDecrements(cart, productOptions);
    setProductOptions((prev) => applyOptimisticStock(prev, stockDecrements));

    // Optimistic reset: clear cart + payment fields BEFORE server round-trip
    // so the cashier can start scanning the next customer instantly (~16ms).
    // If server fails, we restore from the saved snapshot above.
    resetActiveSale({ resetPaymentStatus: true, playSuccessTone: true });
    // Refocus barcode input immediately — zero wait for next customer
    barcodeRef.current?.focus();

    try {
      const result = await completeSaleAction({
        storeId: store.id,
        tillId,
        cart: JSON.stringify(cart),
        paymentStatus,
        customerId,
        dueDate: formRef.current?.querySelector<HTMLInputElement>('input[name="dueDate"]')?.value ?? '',
        ...orderDiscountForm.toServicePayload(),
        cashPaid: Math.max(0, Math.round(cashApplied)),
        cardPaid: Math.max(0, Math.round(cardPaidValue)),
        transferPaid: Math.max(0, Math.round(transferPaidValue)),
        momoPaid: Math.max(0, Math.round(momoPaidValue)),
        momoRef: momoRef.trim() || undefined,
        momoCollectionId: momoCollectionId || undefined,
        momoPayerMsisdn: momoPayerMsisdn.trim() || undefined,
        momoNetwork,
      });

      if (result.success) {
        const { receiptId, totalPence, transactionNumber } = result.data;
        // Store receipt ID for reprinting
        setLastReceiptId(receiptId);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(lastReceiptStorageKey, receiptId);
        }
        // Inventory already updated optimistically above — no server round-trip needed.
        showSaleSuccess({ receiptId, totalPence, transactionNumber }, 3000);
      } else {
        restoreSaleSnapshot(saleSnapshot, result.error);
      }
    } catch (err) {
      // Network error — automatically queue sale offline
      if (!navigator.onLine || (err instanceof TypeError && err.message.includes('fetch'))) {
        try {
          const offlineId = await queueOfflineSale({
            businessId: business.id,
            storeId: store.id,
            tillId,
            customerId: saleSnapshot.customerId || null,
            paymentStatus,
            lines: saleSnapshot.cart.map(l => ({
              productId: l.productId,
              unitId: l.unitId,
              qtyInUnit: l.qtyInUnit,
              discountType: l.discountType ?? 'NONE',
              discountValue: l.discountValue ?? '',
            })),
            payments: buildOfflinePayments({ cashApplied, cardPaidValue, transferPaidValue, momoPaidValue }),
            orderDiscountType,
            orderDiscountValue: orderDiscountInput,
            createdAt: new Date().toISOString(),
          });
          // Show success with offline indicator — cart already cleared optimistically
          showSaleSuccess({ receiptId: offlineId, totalPence: totalDue, transactionNumber: '(Queued offline)' }, 4000);
        } catch {
          restoreSaleSnapshot(saleSnapshot, 'Offline queue failed. Please try again.');
        }
      } else {
        restoreSaleSnapshot(saleSnapshot, 'Something went wrong. Please try again.');
      }
    } finally {
      endCompletion();
    }
  };

  // O(1) product lookup via Map — avoids O(n) find() per cart line
  const productMap = useMemo(() => buildProductMap(productOptions), [productOptions]);

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

  const hasMethod = (method: PaymentMethod) => paymentMethods.includes(method);

  const togglePaymentMethod = (method: PaymentMethod) => {
    const exists = paymentMethods.includes(method);
    let next = exists
      ? paymentMethods.filter((current) => current !== method)
      : [...paymentMethods, method];
    if (next.length === 0) {
      next = ['CASH'];
    }
    if (!next.includes(method) && exists) {
      if (method === 'CASH') setCashTendered('');
      if (method === 'CARD') setCardPaid('');
      if (method === 'TRANSFER') setTransferPaid('');
      if (method === 'MOBILE_MONEY') {
        resetMomoPaymentFields();
      }
    }
    setPaymentMethods(next);
  };

  const clearQtyDraft = useCallback((lineId: string) => {
    setQtyDrafts((prev) => {
      if (!prev[lineId]) return prev;
      const next = { ...prev };
      delete next[lineId];
      return next;
    });
  }, []);

  const removeLine = useCallback((lineId: string) => {
    pushUndo(cart);
    setCart((prev) => prev.filter((item) => item.id !== lineId));
    clearQtyDraft(lineId);
    if (activeLineId === lineId) {
      setActiveLineId(null);
    }
  }, [activeLineId, cart, clearQtyDraft, pushUndo, setCart]);

  const commitLineQty = (line: CartLine) => {
    const draft = qtyDrafts[line.id];
    if (draft === undefined) return;
    const trimmed = draft.trim();
    if (!trimmed) {
      clearQtyDraft(line.id);
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      clearQtyDraft(line.id);
      return;
    }
    const desiredQty = Math.max(0, Math.floor(parsed));
    const clampedQty = clampQtyInUnit(line.productId, line.unitId, desiredQty, line.id);
    setCart((prev) => {
      if (clampedQty <= 0) {
        return prev.filter((item) => item.id !== line.id);
      }
      return prev.map((item) =>
        item.id === line.id ? { ...item, qtyInUnit: clampedQty } : item
      );
    });
    clearQtyDraft(line.id);
  };



  const filteredProducts = useMemo(() => {
    return filterPosProducts(productOptions, productSearch);
  }, [productOptions, productSearch]);
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



  const addToCart = useCallback((line: { productId: string; unitId: string; qtyInUnit: number }) => {
    if (!line.productId || !line.unitId || line.qtyInUnit <= 0) return;
    if (cart.length === 0) router.prefetch('/pos'); // prime RSC cache while cashier enters payment
    const id = `${line.productId}:${line.unitId}`;
    const existing = cart.find((item) => item.id === id);
    const desiredQty = (existing?.qtyInUnit ?? 0) + line.qtyInUnit;
    const clampedQty = clampQtyInUnit(line.productId, line.unitId, desiredQty, existing?.id);
    if (clampedQty <= 0) return;
    setCart((prev) => {
      if (existing) {
        return prev.map((item) => (item.id === id ? { ...item, qtyInUnit: clampedQty } : item));
      }
      return [
        ...prev,
        { id, ...line, qtyInUnit: clampedQty, discountType: 'NONE', discountValue: '' }
      ];
    });
  }, [cart, clampQtyInUnit, router, setCart]);
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

  const handleQuickCreated = useCallback((created: { id: string; name: string; barcode: string | null; sellingPriceBasePence: number; vatRateBps: number; promoBuyQty: number; promoGetQty: number; onHandBase: number; units: { id: string; name: string; pluralName: string; conversionToBase: number; isBaseUnit: boolean }[] }, matchedScan: boolean) => {
    setQuickAddOpen(false);
    setProductId(created.id);
    const baseUnitId = getProductBaseUnitId(created);
    setUnitId(baseUnitId);
    setProductOptions((prev) => [...prev, { ...created, categoryId: null, categoryName: null, imageUrl: null }]);
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

  const handleBarcodeScan = useCallback((code: string) => {
    const resolution = resolveBarcodeScan(code, productOptions);
    if (!resolution) return;

    if (resolution.kind === 'matched') {
      const { product, baseUnitId } = resolution;
      playBeep(true);
      addToCart({ productId: product.id, unitId: baseUnitId, qtyInUnit: 1 });
      setProductId(product.id);
      setUnitId(baseUnitId);
      setQtyInUnitInput('1');
      setBarcode('');
      setBarcodeAlert(null);
      setStockAlert(null);
      barcodeRef.current?.focus();
    } else {
      playBeep(false);
      setBarcodeAlert(`Barcode "${resolution.code}" not found. Create the product now.`);
      setPendingScan(resolution.code);
      openQuickAdd(resolution.code);
    }
  }, [addToCart, openQuickAdd, playBeep, productOptions]);

  const cartDetails = useMemo(
    () => buildCartDetails(cart, productMap, business.vatEnabled),
    [cart, productMap, business.vatEnabled]
  );

  // Pre-compute available stock per product once per cart change — O(n) instead of O(n²)
  const availableBaseMap = useMemo(() => buildAvailableBaseMap(cart, productMap), [cart, productMap]);

  const totals = useMemo(() => sumCartTotals(cartDetails), [cartDetails]);

  const checkoutSummary = useMemo(() => calculateCheckoutSummary({
    totals,
    orderDiscountType,
    orderDiscountInput,
    vatEnabled: business.vatEnabled,
    discountApprovalThresholdBps: business.discountApprovalThresholdBps,
    discountManagerPin,
    discountReasonCode,
    discountReason,
    paymentMethods,
    cashTendered,
    cardPaid,
    transferPaid,
    momoPaid,
    momoNetwork,
    momoPayerMsisdn,
    momoCollectionStatus,
  }), [
    totals,
    orderDiscountType,
    orderDiscountInput,
    business.vatEnabled,
    business.discountApprovalThresholdBps,
    discountManagerPin,
    discountReasonCode,
    discountReason,
    paymentMethods,
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

  useStalePosMomoCollectionReset({
    momoCollectionId,
    momoCollectionStatus,
    momoCollectionSignature,
    momoSignature,
    needsMomoConfirmation,
    resetMomoCollection,
  });

  const activePaymentMethodLabels = useMemo(
    () => paymentMethods.map((method) =>
      method === 'CASH' ? 'Cash' : method === 'CARD' ? 'Card' : method === 'TRANSFER' ? 'Transfer' : 'MoMo'
    ),
    [paymentMethods]
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
  const hasPaymentError = nonCashOverpay;
  // MoMo collection API not yet integrated — allow sales with MoMo as a
  // manually-recorded payment method (same as cash/card/transfer).  Once
  // providers are connected, flip this back to:
  //   const momoReady = !needsMomoConfirmation || momoConfirmed;
  const momoReady = true;
  const tillReady =
    !business.requireOpenTillForSales || openShiftTillIds.includes(tillId);
  const canSubmit = Boolean(
    cart.length > 0 &&
    fullyPaid &&
    !hasPaymentError &&
    momoReady &&
    discountApprovalReady &&
    tillReady &&
    (!requiresCustomer || customerId)
  );
  const checkoutIssues = useMemo(() => {
    const issues: Array<{ tone: 'warning' | 'success'; message: string }> = [];
    if (requiresCustomer && !customerId) {
      issues.push({ tone: 'warning', message: 'Select a customer for credit or part-paid sales.' });
    }
    if (hasPaymentError) {
      issues.push({ tone: 'warning', message: 'Card, transfer, or MoMo cannot exceed the total due.' });
    }
    if (!tillReady) {
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
    return issues;
  }, [customerId, discountApprovalReady, fullyPaid, hasPaymentError, momoConfirmed, needsMomoConfirmation, paymentStatus, requiresCustomer, requiresDiscountApproval, tillReady]);
  const confidenceTone = !cart.length
    ? 'neutral'
    : canSubmit
      ? 'ready'
      : checkoutIssues.some((issue) => issue.tone === 'warning')
        ? 'attention'
        : 'neutral';
  const primaryCheckoutIssue = checkoutIssues.find((issue) => issue.tone === 'warning') ?? checkoutIssues[0] ?? null;
  const errorParam = searchParams.get('error');

  usePosKeyboardShortcuts({
    activeLineId,
    barcodeRef,
    canSubmit,
    cartLength: cart.length,
    cashRef,
    formRef,
    lastCartLineId: cart[cart.length - 1]?.id ?? null,
    lastReceiptId,
    productSearchRef,
    onCloseKeyboardHelp: () => setShowKeyboardHelp(false),
    onOpenParkModal: () => setShowParkModal(true),
    onRemoveLine: removeLine,
    onToggleKeyboardHelp: () => setShowKeyboardHelp((prev) => !prev),
    onUndo: handleUndo,
  });

  usePosScannerBuffer({
    barcodeRef,
    onScan: handleBarcodeScan,
  });

  return (
    <div className="grid gap-6 pb-36 lg:grid-cols-[3fr_1fr] lg:items-start lg:pb-0">
      <div className="space-y-4">
        {/* ── Scan / Search bar ─────────────────────────────── */}
        <div className="card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="w-full sm:min-w-[200px] sm:flex-1">
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                  <svg className="h-5 w-5 text-black/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                </div>
                <input
                  className="input pl-10 pr-11 text-lg font-mono tracking-wider"
                  ref={barcodeRef}
                  autoFocus
                  value={barcode}
                  onChange={(event) => setBarcode(event.target.value)}
                  onKeyDown={handleBarcodeKey}
                  onFocus={(event) => event.currentTarget.select()}
                  autoComplete="off"
                  placeholder="Scan barcode…"
                />
                <button
                  type="button"
                  onClick={() => setCameraOpen(true)}
                  className="absolute inset-y-0 right-2 flex items-center px-1 text-black/40 hover:text-accent transition"
                  title="Scan with camera"
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
              <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center z-10">
                <svg className="h-5 w-5 text-black/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                className="input pl-10 text-lg"
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
                          <div className="mt-1 text-xs text-black/45">Search across {productOptions.length} products or create a new SKU right away.</div>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                            <button
                              type="button"
                              className="rounded-full bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => { openQuickAdd(); setProductSearch(''); }}
                            >
                              Create new product
                            </button>
                            <span className="rounded-full bg-black/5 px-2.5 py-1 text-black/45">F2 returns to barcode</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/5 bg-white/95 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-black/35 backdrop-blur">
                      <span>{productSearchMatches} of {productOptions.length} products</span>
                      <span className="normal-case tracking-normal text-black/35">Enter adds • F2 scan</span>
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
                            <div className="text-right flex-shrink-0">
                              <div className="text-sm font-bold text-emerald-700">{formatMoney(product.sellingPriceBasePence, business.currency)}</div>
                              <div className={`text-[11px] ${outOfStock ? 'text-red-500 font-semibold' : 'text-black/40'}`}>
                                {outOfStock ? 'Out of stock' : `${formatAvailable(product, available)} avail.`}
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
                  className="flex items-center gap-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-semibold hover:bg-black/5 transition"
                  onClick={handleUndo}
                  title="Undo last action"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-semibold hover:bg-black/5 transition"
                onClick={() => setShowKeyboardHelp(true)}
                title="Keyboard shortcuts"
              >
                <svg className="h-4 w-4 text-black/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            </div>
          </div>

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
                <div className="font-semibold">Ready for next customer</div>
                <div className="text-xs text-emerald-700">Scanner focus is back on the till. Keep serving.</div>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">F2 barcode</span>
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
        <form onSubmit={(e) => { e.preventDefault(); handleCompleteSale(); }} className="space-y-4" ref={formRef}>

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
                        <div className="font-semibold">Sale Complete!</div>
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

          {/* Sale error */}
          {saleError && (
            <div className="rounded-lg border border-rose/40 bg-rose/10 px-3 py-2 text-sm text-rose flex items-center justify-between">
              <span>{saleError}</span>
              <button type="button" className="text-xs font-semibold ml-2" onClick={dismissSaleError}>✕</button>
            </div>
          )}

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

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-black/5">
              <div className="flex items-center gap-3">
                <svg className="h-5 w-5 text-black/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span className="text-sm font-semibold">Cart</span>
                <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-bold text-black/50">{cartDetails.length}</span>
              </div>
              <div className="flex items-center gap-3">
                {cartRestored && (
                  <span className="text-xs text-accent font-medium">Restored from last session</span>
                )}
                {cart.length > 0 && (
                  <button
                    type="button"
                    className="text-xs text-rose-500 hover:text-rose-700 font-medium"
                    onClick={() => { if (confirm('Clear the entire cart?')) { pushUndo(cart); setCart([]); clearSavedCart(); } }}
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>

            {cartDetails.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="rounded-full bg-black/5 p-4 mb-3">
                  <svg className="h-8 w-8 text-black/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                </div>
                <div className="text-sm font-semibold text-black/60">Scan a barcode or search a product</div>
                <div className="mt-1 text-xs text-black/35">This till is clear and ready. Items will appear here instantly.</div>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/60 transition hover:bg-black/5"
                    onClick={() => barcodeRef.current?.focus()}
                  >
                    F2 focus barcode
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/60 transition hover:bg-black/5"
                    onClick={() => setShowKeyboardHelp(true)}
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
              <div className="divide-y divide-black/5 overflow-y-auto max-h-[38vh] md:max-h-[42vh] lg:max-h-[45vh] scroll-smooth">
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
                              const newQty = line.qtyInUnit - 1;
                              if (newQty <= 0) { removeLine(line.id); }
                              else {
                                pushUndo(cart);
                                setCart((prev) => prev.map((item) => item.id === line.id ? { ...item, qtyInUnit: newQty } : item));
                              }
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
                              const newQty = clampQtyInUnit(line.productId, line.unitId, line.qtyInUnit + 1, line.id);
                              if (newQty > line.qtyInUnit) {
                                pushUndo(cart);
                                setCart((prev) => prev.map((item) => item.id === line.id ? { ...item, qtyInUnit: newQty } : item));
                              }
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
                    setCart((prev) =>
                      prev.map((item) =>
                        item.id === activeLineId ? { ...item, discountType: nextType, discountValue: nextType === 'NONE' ? '' : item.discountValue ?? '' } : item
                      )
                    );
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
                      onChange={(e) => setCart((prev) => prev.map((item) => item.id === activeLineId ? { ...item, discountValue: e.target.value } : item))}
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
                        setCart((prev) =>
                          prev.map((item) =>
                            item.id === activeLineId ? { ...item, id: `${item.productId}:${newUnitId}`, unitId: newUnitId, qtyInUnit: 1 } : item
                          )
                        );
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

          {/* ── Payment section ─────────────────────────────── */}
          <div id="pos-payment-panel" className="card scroll-mt-[calc(var(--app-header-offset)+0.75rem)] p-4 space-y-4" tabIndex={-1}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="label">Till</label>
                <select className="input" name="tillId" value={tillId} onChange={(e) => setTillId(e.target.value)}>
                  {tills.map((till) => (<option key={till.id} value={till.id}>{till.name}</option>))}
                </select>
                {business.requireOpenTillForSales ? (
                  <div className={`mt-1 text-xs ${tillReady ? 'text-emerald-700' : 'text-rose'}`}>
                    {tillReady ? 'Till is open' : 'Till is not open'}
                  </div>
                ) : null}
              </div>
              <div>
                <label className="label">Payment Status</label>
                <select className="input" name="paymentStatus" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as any)}>
                  <option value="PAID">Paid</option>
                  <option value="PART_PAID">Part Paid</option>
                  <option value="UNPAID">Unpaid (Credit)</option>
                </select>
              </div>
              <div>
                <label className="label">Method</label>
                <div className="mt-1.5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  {availablePaymentMethods.map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => togglePaymentMethod(method)}
                      className={`rounded-full px-3 py-2 text-sm font-semibold transition sm:px-4 ${hasMethod(method) ? (method === 'MOBILE_MONEY' ? 'bg-yellow-500 text-white' : 'bg-accent text-white') : 'bg-black/5 text-black/50 hover:bg-black/10'}`}
                    >
                      {method === 'CASH' ? 'Cash' : method === 'CARD' ? 'Card' : method === 'TRANSFER' ? 'Transfer' : 'MoMo'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Due Date</label>
                <input className="input" name="dueDate" type="date" />
              </div>
            </div>

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

            {/* Order discount */}
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_9rem] sm:items-end">
              <label className="label whitespace-nowrap">Order Discount</label>
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
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
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

            {/* Cash / Card / Transfer inputs */}
            <div className="grid gap-3 sm:grid-cols-3">
              {hasMethod('CASH') && (
                <div>
                  <label className="label">Cash Tendered</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    ref={cashRef}
                    value={cashTendered}
                    onChange={(e) => setCashTendered(e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <div className="mt-1.5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-1.5">
                    {[1, 2, 5, 10, 20, 50, 100, 200].map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        className="rounded-md border border-black/10 bg-white px-3 py-2 text-center text-xs font-semibold hover:bg-black/5"
                        onClick={() => setCashTendered(String(amount))}
                      >
                        {formatMoney(amount * 100, business.currency)}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-xs font-semibold text-emerald-700 hover:bg-emerald-100 sm:min-w-[5rem]"
                      onClick={() => setCashTendered(String(totalDue / 100))}
                    >
                      Exact
                    </button>
                  </div>
                </div>
              )}
              {hasMethod('CARD') && (
                <div>
                  <label className="label">Card Amount</label>
                  <input className="input" type="number" min={0} step="0.01" inputMode="decimal" value={cardPaid} onChange={(e) => setCardPaid(e.target.value)} onFocus={(e) => e.currentTarget.select()} />
                </div>
              )}
              {hasMethod('TRANSFER') && (
                <div>
                  <label className="label">Transfer Amount</label>
                  <input className="input" type="number" min={0} step="0.01" inputMode="decimal" value={transferPaid} onChange={(e) => setTransferPaid(e.target.value)} onFocus={(e) => e.currentTarget.select()} />
                </div>
              )}
              {hasMethod('MOBILE_MONEY') && (
                <div>
                  <label className="label flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-yellow-500"></span>
                    MoMo Amount
                  </label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={momoPaid}
                    onChange={(e) => setMomoPaid(e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                    placeholder="0.00"
                  />
                  <select
                    className="input mt-1.5"
                    value={momoNetwork}
                    onChange={(e) => setMomoNetwork(e.target.value as CollectionNetwork)}
                  >
                    <option value="MTN">MTN</option>
                    <option value="TELECEL">Telecel</option>
                    <option value="AIRTELTIGO">AirtelTigo</option>
                  </select>
                  <input
                    className="input mt-1.5"
                    type="tel"
                    value={momoPayerMsisdn}
                    onChange={(e) => setMomoPayerMsisdn(e.target.value)}
                    placeholder="Payer number (e.g. 024xxxxxxx)"
                  />
                  {momoCollectionStatus === 'IDLE' ? (
                    <div className="mt-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-[11px] text-emerald-800">
                      {momoGuidance}
                    </div>
                  ) : null}
                  <input
                    className="input mt-1.5"
                    type="text"
                    value={momoRef}
                    onChange={(e) => setMomoRef(e.target.value)}
                    placeholder="Transaction ref (optional)"
                  />
                </div>
              )}
            </div>

            <div className={`rounded-2xl border px-4 py-3 shadow-sm transition ${confidenceTone === 'ready'
              ? 'border-emerald-200 bg-emerald-50/80'
              : confidenceTone === 'attention'
                ? 'border-amber-200 bg-amber-50/80'
                : 'border-black/10 bg-black/[.02]'
              }`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${confidenceTone === 'ready'
                      ? 'bg-emerald-600 text-white'
                      : confidenceTone === 'attention'
                        ? 'bg-amber-500 text-white'
                        : 'bg-black/10 text-black/55'
                      }`}>{paymentStatus.replace('_', ' ')}</span>
                    {activePaymentMethodLabels.map((label) => (
                      <span key={label} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-black/60 ring-1 ring-black/10">{label}</span>
                    ))}
                    {cart.length === 0 ? <span className="rounded-full bg-white px-2.5 py-1 text-xs text-black/45 ring-1 ring-black/10">Next customer standby</span> : null}
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-black/35">Payment check</div>
                    <div className="mt-1 flex flex-wrap items-end gap-x-4 gap-y-1">
                      <div>
                        <div className="text-[11px] text-black/40">Due</div>
                        <div className="text-lg font-bold text-ink">{formatMoney(totalDue, business.currency)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-black/40">Tendered</div>
                        <div className="text-sm font-semibold text-black/70">{formatMoney(totalPaid, business.currency)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-black/40">Balance</div>
                        <div className={`text-sm font-semibold ${balanceRemaining > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{formatMoney(balanceRemaining, business.currency)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-black/40">Change</div>
                        <div className={`text-sm font-semibold ${changeDue > 0 ? 'text-accent' : 'text-black/55'}`}>{formatMoney(changeDue, business.currency)}</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="min-w-0 lg:max-w-sm">
                  {checkoutIssues.length > 0 ? (
                    <div className="space-y-1.5">
                      {checkoutIssues.map((issue) => (
                        <div key={issue.message} className={`rounded-xl px-3 py-2 text-xs font-medium ${issue.tone === 'success'
                          ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200'
                          : 'bg-white text-amber-900 ring-1 ring-amber-200'
                          }`}>
                          {issue.tone === 'success' ? '✓ ' : '• '}{issue.message}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl bg-white px-3 py-2 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200">
                      ✓ Payment and till checks are clear. This sale is ready to complete.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 md:flex-row">
              <button className="btn-primary hidden flex-1 py-3 text-lg md:inline-flex md:items-center md:justify-center" type="submit" disabled={!canSubmit || isCompletingSale}>
                {isCompletingSale ? 'Processing…' : `Complete Sale — ${formatMoney(totalDue, business.currency)}`}
              </button>
              {cart.length > 0 && (
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 md:w-auto"
                  onClick={() => setShowParkModal(true)}
                  title="Park this sale and serve another customer"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  <span>Park Sale</span>
                </button>
              )}
            </div>
          </div>
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
          className="fixed inset-x-4 z-20 max-h-[45vh] overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-2xl lg:hidden"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 7rem)' }}
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

      {/* ── Mobile sticky bottom bar (total + checkout) ──── */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-30 lg:hidden bg-white border-t border-black/10 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] px-4 pt-3 safe-area-bottom">
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
                className="btn-primary flex-1 px-5 py-3 text-sm font-bold"
                disabled={!canSubmit || isCompletingSale}
                onClick={handleCompleteSale}
              >
                {isCompletingSale ? 'Processing…' : 'Complete Sale →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
