'use client';

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { formatMoney } from '@/lib/format';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';
import { completeSaleAction } from '@/app/actions/sales';
import {
  checkMomoCollectionStatusAction,
  initiateMomoCollectionAction,
} from '@/app/actions/mobile-money';
import { DISCOUNT_REASON_CODES } from '@/lib/fraud/reason-codes';
import SummarySidebar from './components/SummarySidebar';
import KeyboardHelpModal from './components/KeyboardHelpModal';
import QuickAddPanel from './components/QuickAddPanel';
import ParkModal from './components/ParkModal';

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
  customers: { id: string; name: string }[];
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
type CollectionNetwork = 'MTN' | 'TELECEL' | 'AIRTELTIGO' | 'UNKNOWN';
type MomoCollectionState = 'IDLE' | 'PENDING' | 'CONFIRMED' | 'FAILED' | 'TIMEOUT';

const CART_STORAGE_KEY = 'pos.savedCart';
const CART_CUSTOMER_KEY = 'pos.savedCustomer';
const PARKED_CARTS_KEY = 'pos.parkedCarts';

type ParkedCart = {
  id: string;
  label: string;
  cart: CartLine[];
  customerId: string;
  parkedAt: string;
  itemCount: number;
};

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
  const [tillId, setTillId] = useState(tills[0]?.id ?? '');
  const [customerId, setCustomerId] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(['CASH']);
  const [cashTendered, setCashTendered] = useState('');
  const [cardPaid, setCardPaid] = useState('');
  const [transferPaid, setTransferPaid] = useState('');
  const [momoPaid, setMomoPaid] = useState('');
  const [momoRef, setMomoRef] = useState('');
  const [momoPayerMsisdn, setMomoPayerMsisdn] = useState('');
  const [momoNetwork, setMomoNetwork] = useState<CollectionNetwork>('MTN');
  const [momoCollectionId, setMomoCollectionId] = useState('');
  const [momoCollectionStatus, setMomoCollectionStatus] = useState<MomoCollectionState>('IDLE');
  const [momoCollectionError, setMomoCollectionError] = useState<string | null>(null);
  const [momoIdempotencyKey, setMomoIdempotencyKey] = useState('');
  const [momoCollectionSignature, setMomoCollectionSignature] = useState('');
  const [isInitiatingMomo, setIsInitiatingMomo] = useState(false);
  const [stockAlert, setStockAlert] = useState<string | null>(null);
  const [barcodeAlert, setBarcodeAlert] = useState<string | null>(null);
  const [orderDiscountType, setOrderDiscountType] = useState<DiscountType>('NONE');
  const [orderDiscountInput, setOrderDiscountInput] = useState('');
  const [discountManagerPin, setDiscountManagerPin] = useState('');
  const [discountReasonCode, setDiscountReasonCode] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [lastReceiptId, setLastReceiptId] = useState('');
  const [saleSuccess, setSaleSuccess] = useState<{ receiptId: string; totalPence: number } | null>(null);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [isCompletingSale, setIsCompletingSale] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);

  const cashRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const scanBufferRef = useRef<{
    value: string;
    lastTime: number;
    fastCount: number;
    timer?: ReturnType<typeof setTimeout>;
    active: boolean;
  }>({ value: '', lastTime: 0, fastCount: 0, active: false });
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddBarcode, setQuickAddBarcode] = useState('');
  const [pendingScan, setPendingScan] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');

  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const productSearchRef = useRef<HTMLInputElement>(null);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [undoStack, setUndoStack] = useState<CartLine[][]>([]);
  const maxUndoSteps = 10;
  const [cartRestored, setCartRestored] = useState(false);
  const cartInitialized = useRef(false);

  // Park/hold state
  const [parkedCarts, setParkedCarts] = useState<ParkedCart[]>([]);
  const [showParkModal, setShowParkModal] = useState(false);
  const [showParkedPanel, setShowParkedPanel] = useState(false);

  const pushUndo = useCallback((currentCart: CartLine[]) => {
    setUndoStack((prev) => [...prev.slice(-(maxUndoSteps - 1)), currentCart]);
  }, [maxUndoSteps]);

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
    if (undoStack.length === 0) return;
    const previousCart = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setCart(previousCart);
    playBeep(true);
  }, [undoStack, playBeep]);

  const selectedProduct = useMemo(
    () => productOptions.find((product) => product.id === productId),
    [productOptions, productId]
  );
  const selectedUnits = selectedProduct?.units ?? [];
  const selectedUnit = selectedUnits.find((unit) => unit.id === unitId) ?? selectedUnits[0];

  const parseCurrencyToPence = useCallback((value: string | undefined | null) => {
    if (!value) return 0;
    const trimmed = String(value).replace(/,/g, '').trim();
    if (!trimmed) return 0;
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? 0 : Math.round(parsed * 100);
  }, []);

  const parsePercent = useCallback((value: string | undefined | null) => {
    if (!value) return 0;
    const trimmed = String(value).replace(/,/g, '').trim();
    if (!trimmed) return 0;
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? 0 : parsed;
  }, []);

  const computeDiscount = useCallback((subtotal: number, type?: DiscountType, value?: string) => {
    if (!subtotal || !type || type === 'NONE') return 0;
    if (type === 'PERCENT') {
      const pct = Math.min(Math.max(parsePercent(value ?? ''), 0), 100);
      return Math.round((subtotal * pct) / 100);
    }
    if (type === 'AMOUNT') {
      const amount = Math.max(parseCurrencyToPence(value ?? ''), 0);
      return Math.min(amount, subtotal);
    }
    return 0;
  }, [parseCurrencyToPence, parsePercent]);

  const openQuickAdd = useCallback((barcodeValue?: string) => {
    setQuickAddOpen(true);
    setQuickAddBarcode(barcodeValue ?? '');
  }, []);

  const resetMomoCollection = useCallback(() => {
    setMomoCollectionId('');
    setMomoCollectionStatus('IDLE');
    setMomoCollectionError(null);
    setMomoIdempotencyKey('');
    setMomoCollectionSignature('');
    setMomoRef('');
  }, []);

  const applyMomoStatus = useCallback(
    (next: {
      status: string;
      providerStatus?: string | null;
      providerReference?: string | null;
      providerTransactionId?: string | null;
      failureReason?: string | null;
    }) => {
      const normalized = (next.status || 'IDLE').toUpperCase() as MomoCollectionState;
      setMomoCollectionStatus(normalized);
      const providerRef = next.providerTransactionId ?? next.providerReference ?? '';
      if (providerRef) setMomoRef(providerRef);
      if (normalized === 'FAILED' || normalized === 'TIMEOUT') {
        setMomoCollectionError(
          next.failureReason ||
            `MoMo collection ${normalized.toLowerCase()}. You can retry safely.`
        );
      } else if (normalized === 'CONFIRMED') {
        setMomoCollectionError(null);
      }
    },
    []
  );

  useEffect(() => {
    barcodeRef.current?.focus();
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setLastReceiptId(window.localStorage.getItem('lastReceiptId') ?? '');
    }
  }, []);

  // Load saved cart from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined' || cartInitialized.current) return;
    cartInitialized.current = true;
    try {
      const savedCart = window.localStorage.getItem(CART_STORAGE_KEY);
      const savedCustomer = window.localStorage.getItem(CART_CUSTOMER_KEY);
      if (savedCart) {
        const parsed = JSON.parse(savedCart) as CartLine[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Validate cart items still exist in products
          const validCart = parsed.filter((line) =>
            productOptions.some((p) => p.id === line.productId)
          );
          if (validCart.length > 0) {
            setCart(validCart);
            setCartRestored(true);
            // Auto-dismiss after 5 seconds
            setTimeout(() => setCartRestored(false), 5000);
          }
        }
      }
      if (savedCustomer) {
        const customerExists = customers.some((c) => c.id === savedCustomer);
        if (customerExists) {
          setCustomerId(savedCustomer);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, [productOptions, customers]);

  // Save cart to localStorage when it changes
  useEffect(() => {
    if (typeof window === 'undefined' || !cartInitialized.current) return;
    if (cart.length > 0) {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
      if (customerId) {
        window.localStorage.setItem(CART_CUSTOMER_KEY, customerId);
      }
    } else {
      window.localStorage.removeItem(CART_STORAGE_KEY);
      window.localStorage.removeItem(CART_CUSTOMER_KEY);
    }
  }, [cart, customerId]);

  // Clear saved cart after successful sale
  const clearSavedCart = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(CART_STORAGE_KEY);
      window.localStorage.removeItem(CART_CUSTOMER_KEY);
    }
  };

  // ── Park/Hold Cart ──────────────────────────────────────
  // Load parked carts on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(PARKED_CARTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ParkedCart[];
        if (Array.isArray(parsed)) setParkedCarts(parsed);
      }
    } catch { /* ignore */ }
  }, []);

  const saveParkedCarts = useCallback((carts: ParkedCart[]) => {
    setParkedCarts(carts);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PARKED_CARTS_KEY, JSON.stringify(carts));
    }
  }, []);

  const parkCurrentCart = useCallback((label: string) => {
    if (cart.length === 0) return;
    const parked: ParkedCart = {
      id: Date.now().toString(36),
      label: label.trim() || `Sale (${cart.length} items)`,
      cart: [...cart],
      customerId,
      parkedAt: new Date().toISOString(),
      itemCount: cart.length,
    };
    const updated = [...parkedCarts, parked];
    saveParkedCarts(updated);
    // Clear current cart
    setCart([]);
    clearSavedCart();
    setCustomerId('');
    setCashTendered('');
    setCardPaid('');
    setTransferPaid('');
    setMomoPaid('');
    setMomoPayerMsisdn('');
    setMomoNetwork('MTN');
    resetMomoCollection();
    setPaymentMethods(['CASH']);
    setOrderDiscountType('NONE');
    setOrderDiscountInput('');
    setDiscountManagerPin('');
    setDiscountReasonCode('');
    setDiscountReason('');
    setQtyDrafts({});
    setUndoStack([]);
    playBeep(true);
  }, [cart, customerId, parkedCarts, playBeep, resetMomoCollection, saveParkedCarts]);

  const recallParkedCart = useCallback((parkedId: string) => {
    const parked = parkedCarts.find((p) => p.id === parkedId);
    if (!parked) return;
    // If current cart has items, park it first (swap)
    if (cart.length > 0) {
      const currentParked: ParkedCart = {
        id: Date.now().toString(36),
        label: `Swapped sale (${cart.length} items)`,
        cart: [...cart],
        customerId,
        parkedAt: new Date().toISOString(),
        itemCount: cart.length,
      };
      const updated = parkedCarts.filter((p) => p.id !== parkedId);
      updated.push(currentParked);
      saveParkedCarts(updated);
    } else {
      saveParkedCarts(parkedCarts.filter((p) => p.id !== parkedId));
    }
    // Restore parked cart
    const validCart = parked.cart.filter((line) =>
      productOptions.some((p) => p.id === line.productId)
    );
    setCart(validCart);
    if (parked.customerId) {
      const customerExists = customers.some((c) => c.id === parked.customerId);
      setCustomerId(customerExists ? parked.customerId : '');
    }
    playBeep(true);
  }, [cart, customerId, customers, parkedCarts, productOptions, saveParkedCarts, playBeep]);

  const deleteParkedCart = useCallback((parkedId: string) => {
    saveParkedCarts(parkedCarts.filter((p) => p.id !== parkedId));
  }, [parkedCarts, saveParkedCarts]);

  const handleInitiateMomoCollection = useCallback(async () => {
    if (isInitiatingMomo) return;

    const amountPence = Math.max(0, Math.round(parseCurrencyToPence(momoPaid)));
    const payer = momoPayerMsisdn.trim();
    if (amountPence <= 0) {
      setMomoCollectionError('Enter a valid MoMo amount before requesting collection.');
      return;
    }
    if (!payer) {
      setMomoCollectionError('Enter the payer phone number to request collection.');
      return;
    }

    setIsInitiatingMomo(true);
    setMomoCollectionError(null);
    setMomoCollectionStatus('PENDING');

    const nextIdempotencyKey =
      momoIdempotencyKey ||
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

    try {
      const result = await initiateMomoCollectionAction({
        storeId: store.id,
        amountPence,
        payerMsisdn: payer,
        network: momoNetwork,
        idempotencyKey: nextIdempotencyKey,
      });

      if (!result.success) {
        setMomoCollectionStatus('FAILED');
        setMomoCollectionError(result.error);
        return;
      }

      setMomoIdempotencyKey(nextIdempotencyKey);
      setMomoCollectionId(result.data.collectionId);
      setMomoCollectionSignature(
        `${amountPence}|${momoNetwork}|${momoPayerMsisdn.trim().replace(/\s+/g, '')}`
      );
      applyMomoStatus({
        status: result.data.status,
        providerStatus: result.data.providerStatus,
        providerReference: result.data.providerReference,
        providerTransactionId: result.data.providerTransactionId,
        failureReason: result.data.failureReason,
      });
    } catch {
      setMomoCollectionStatus('FAILED');
      setMomoCollectionError('Unable to initiate MoMo collection. Please retry.');
    } finally {
      setIsInitiatingMomo(false);
    }
  }, [
    applyMomoStatus,
    isInitiatingMomo,
    momoIdempotencyKey,
    momoNetwork,
    momoPaid,
    momoPayerMsisdn,
    parseCurrencyToPence,
    store.id,
  ]);

  useEffect(() => {
    if (!momoCollectionId) return;
    if (momoCollectionStatus !== 'PENDING') return;

    let active = true;
    const poll = async () => {
      const result = await checkMomoCollectionStatusAction(momoCollectionId);
      if (!active || !result.success) return;
      applyMomoStatus({
        status: result.data.status,
        providerStatus: result.data.providerStatus,
        providerReference: result.data.providerReference,
        providerTransactionId: result.data.providerTransactionId,
        failureReason: result.data.failureReason,
      });
    };

    const interval = window.setInterval(() => {
      poll().catch(() => null);
    }, 5000);

    poll().catch(() => null);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [applyMomoStatus, momoCollectionId, momoCollectionStatus]);

  const handleCompleteSale = async () => {
    if (!canSubmit || isCompletingSale) return;
    setIsCompletingSale(true);
    setSaleError(null);

    // Generate a unique idempotency key per sale attempt to prevent double-submissions
    const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    try {
      const result = await completeSaleAction({
        storeId: store.id,
        tillId,
        cart: JSON.stringify(cart),
        paymentStatus,
        idempotencyKey,
        customerId,
        dueDate: formRef.current?.querySelector<HTMLInputElement>('input[name="dueDate"]')?.value ?? '',
        orderDiscountType,
        orderDiscountValue: orderDiscountInput,
        cashPaid: Math.max(0, Math.round(cashApplied)),
        cardPaid: Math.max(0, Math.round(cardPaidValue)),
        transferPaid: Math.max(0, Math.round(transferPaidValue)),
        momoPaid: Math.max(0, Math.round(momoPaidValue)),
        momoRef: momoRef.trim() || undefined,
        momoCollectionId: momoCollectionId || undefined,
        momoPayerMsisdn: momoPayerMsisdn.trim() || undefined,
        momoNetwork,
        discountManagerPin: discountManagerPin.trim() || undefined,
        discountReasonCode: discountReasonCode || undefined,
        discountReason: discountReason.trim() || undefined,
      });

      if (result.success) {
        const { receiptId, totalPence } = result.data;
        // Store receipt ID for reprinting
        setLastReceiptId(receiptId);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('lastReceiptId', receiptId);
        }
        // Show success toast
        setSaleSuccess({ receiptId, totalPence });
        // Reset cart and payment fields
        setCart([]);
        clearSavedCart();
        setCustomerId('');
        setCashTendered('');
        setCardPaid('');
        setTransferPaid('');
        setMomoPaid('');
        setMomoRef('');
        setMomoPayerMsisdn('');
        setMomoNetwork('MTN');
        resetMomoCollection();
        setPaymentStatus('PAID');
        setPaymentMethods(['CASH']);
        setOrderDiscountType('NONE');
        setOrderDiscountInput('');
        setDiscountManagerPin('');
        setDiscountReasonCode('');
        setDiscountReason('');
        setQtyDrafts({});
        setUndoStack([]);
        playBeep(true);
        // Auto-dismiss success toast after 8 seconds
        setTimeout(() => setSaleSuccess(null), 8000);
        // Refresh server data (product stock levels etc)
        router.refresh();
      } else {
        setSaleError(result.error);
        playBeep(false);
      }
    } catch {
      setSaleError('Something went wrong. Please try again.');
      playBeep(false);
    } finally {
      setIsCompletingSale(false);
    }
  };

  const getProduct = useCallback(
    (id: string) => productOptions.find((product) => product.id === id),
    [productOptions]
  );
  const getUnit = useCallback(
    (product: ProductDto | undefined, unitIdValue: string) =>
      product?.units.find((unit) => unit.id === unitIdValue),
    []
  );

  const getAvailableBase = useCallback((targetProductId: string, excludeLineId?: string) => {
    const product = getProduct(targetProductId);
    if (!product) return 0;
    const usedBase = cart.reduce((sum, line) => {
      if (line.productId !== targetProductId || line.id === excludeLineId) return sum;
      const unit = getUnit(product, line.unitId);
      if (!unit) return sum;
      return sum + line.qtyInUnit * unit.conversionToBase;
    }, 0);
    return Math.max(product.onHandBase - usedBase, 0);
  }, [cart, getProduct, getUnit]);

  const formatAvailable = useCallback((product: ProductDto, availableBase: number) => {
    const baseUnit = product.units.find((unit) => unit.isBaseUnit);
    const packaging = getPrimaryPackagingUnit(
      product.units.map((unit) => ({ conversionToBase: unit.conversionToBase, unit }))
    );
    return formatMixedUnit({
      qtyBase: availableBase,
      baseUnit: baseUnit?.name ?? 'unit',
      baseUnitPlural: baseUnit?.pluralName,
      packagingUnit: packaging?.unit.name,
      packagingUnitPlural: packaging?.unit.pluralName,
      packagingConversion: packaging?.conversionToBase
    });
  }, []);

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
  }, [formatAvailable, getAvailableBase, getProduct, getUnit]);

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
        setMomoPaid('');
        setMomoPayerMsisdn('');
        setMomoNetwork('MTN');
        resetMomoCollection();
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
  }, [activeLineId, cart, clearQtyDraft, pushUndo]);

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
    if (!productSearch.trim()) return [];
    const search = productSearch.toLowerCase();
    return productOptions
      .filter((p) =>
        p.name.toLowerCase().includes(search) ||
        (p.barcode && p.barcode.toLowerCase().includes(search)) ||
        (p.categoryName && p.categoryName.toLowerCase().includes(search))
      )
      .slice(0, 10);
  }, [productOptions, productSearch]);



  const addToCart = useCallback((line: { productId: string; unitId: string; qtyInUnit: number }) => {
    if (!line.productId || !line.unitId || line.qtyInUnit <= 0) return;
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
  }, [cart, clampQtyInUnit]);

  const handleQuickCreated = useCallback((created: { id: string; name: string; barcode: string | null; sellingPriceBasePence: number; vatRateBps: number; promoBuyQty: number; promoGetQty: number; onHandBase: number; units: { id: string; name: string; pluralName: string; conversionToBase: number; isBaseUnit: boolean }[] }, matchedScan: boolean) => {
    setQuickAddOpen(false);
    setProductId(created.id);
    const baseUnit = created.units.find((unit) => unit.isBaseUnit) ?? created.units[0];
    setUnitId(baseUnit?.id ?? '');
    setProductOptions((prev) => [...prev, { ...created, categoryId: null, categoryName: null, imageUrl: null }]);
    if (matchedScan) {
      addToCart({ productId: created.id, unitId: baseUnit?.id ?? '', qtyInUnit: 1 });
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

  const handleBarcodeScan = useCallback((code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    const match = productOptions.find((product) => product.barcode === trimmed);
    if (match) {
      playBeep(true);
      const base = match.units.find((unit) => unit.isBaseUnit) ?? match.units[0];
      addToCart({ productId: match.id, unitId: base?.id ?? '', qtyInUnit: 1 });
      setProductId(match.id);
      setUnitId(base?.id ?? '');
      setQtyInUnitInput('1');
      setBarcode('');
      setBarcodeAlert(null);
      setStockAlert(null);
      barcodeRef.current?.focus();
    } else {
      playBeep(false);
      setBarcodeAlert(`Barcode "${trimmed}" not found. Create the product now.`);
      setPendingScan(trimmed);
      openQuickAdd(trimmed);
    }
  }, [addToCart, openQuickAdd, playBeep, productOptions]);

  const cartDetails = useMemo(() => {
    return cart
      .map((line) => {
        const product = productOptions.find((p) => p.id === line.productId);
        const unit = product?.units.find((u) => u.id === line.unitId);
        if (!product || !unit) return null;
        const qtyBase = line.qtyInUnit * unit.conversionToBase;
        const unitPrice = unit.conversionToBase * product.sellingPriceBasePence;
        const subtotal = unitPrice * line.qtyInUnit;
        const lineDiscount = computeDiscount(subtotal, line.discountType, line.discountValue);
        const promoBuyQty = product.promoBuyQty ?? 0;
        const promoGetQty = product.promoGetQty ?? 0;
        const promoGroup = promoBuyQty + promoGetQty;
        const promoFreeUnits =
          promoBuyQty > 0 && promoGetQty > 0 && promoGroup > 0
            ? Math.floor(qtyBase / promoGroup) * promoGetQty
            : 0;
        const promoDiscount = Math.min(
          promoFreeUnits * product.sellingPriceBasePence,
          Math.max(subtotal - lineDiscount, 0)
        );
        const netSubtotal = Math.max(subtotal - lineDiscount - promoDiscount, 0);
        const vat = business.vatEnabled ? Math.round((netSubtotal * product.vatRateBps) / 10000) : 0;
        const total = netSubtotal + vat;
        const baseUnit = product.units.find((u) => u.isBaseUnit);
        const packaging = getPrimaryPackagingUnit(
          product.units.map((u) => ({ conversionToBase: u.conversionToBase, unit: u }))
        );
        const qtyLabel = formatMixedUnit({
          qtyBase,
          baseUnit: baseUnit?.name ?? 'unit',
          baseUnitPlural: baseUnit?.pluralName,
          packagingUnit: packaging?.unit.name,
          packagingUnitPlural: packaging?.unit.pluralName,
          packagingConversion: packaging?.conversionToBase
        });
        return {
          ...line,
          product,
          unit,
          qtyLabel,
          unitPrice,
          subtotal,
          lineDiscount,
          promoDiscount,
          netSubtotal,
          vat,
          total,
          promoLabel:
            promoFreeUnits > 0
              ? `Promo: ${promoBuyQty} + ${promoGetQty} (free ${promoFreeUnits})`
              : null
        };
      })
      .filter(Boolean) as Array<
        CartLine & {
          product: ProductDto;
          unit: UnitDto;
          qtyLabel: string;
          unitPrice: number;
          subtotal: number;
          lineDiscount: number;
          promoDiscount: number;
          netSubtotal: number;
          vat: number;
          total: number;
          promoLabel: string | null;
        }
      >;
  }, [cart, productOptions, business.vatEnabled, computeDiscount]);

  const totals = cartDetails.reduce(
    (acc, line) => {
      acc.subtotal += line.subtotal;
      acc.lineDiscount += line.lineDiscount;
      acc.promoDiscount += line.promoDiscount;
      acc.netSubtotal += line.netSubtotal;
      acc.vat += line.vat;
      return acc;
    },
    { subtotal: 0, lineDiscount: 0, promoDiscount: 0, netSubtotal: 0, vat: 0 }
  );

  const orderDiscount = computeDiscount(
    totals.netSubtotal,
    orderDiscountType,
    orderDiscountInput
  );
  const totalDiscountPence = totals.lineDiscount + totals.promoDiscount + orderDiscount;
  const discountBps =
    totals.subtotal > 0 ? Math.round((totalDiscountPence * 10_000) / totals.subtotal) : 0;
  const requiresDiscountApproval =
    discountBps > (business.discountApprovalThresholdBps ?? 1500);
  const discountApprovalReady =
    !requiresDiscountApproval ||
    (!!discountManagerPin.trim() && (!!discountReasonCode || !!discountReason.trim()));
  const netAfterOrderDiscount = Math.max(totals.netSubtotal - orderDiscount, 0);
  const vatRatio =
    business.vatEnabled && totals.netSubtotal > 0
      ? netAfterOrderDiscount / totals.netSubtotal
      : 1;
  const vatTotal = business.vatEnabled ? Math.round(totals.vat * vatRatio) : 0;
  const totalDue = netAfterOrderDiscount + vatTotal;

  const cashTenderedValue = hasMethod('CASH') ? parseCurrencyToPence(cashTendered) : 0;
  const cardPaidRaw = hasMethod('CARD') ? parseCurrencyToPence(cardPaid) : 0;
  const transferPaidRaw = hasMethod('TRANSFER') ? parseCurrencyToPence(transferPaid) : 0;
  const momoPaidRaw = hasMethod('MOBILE_MONEY') ? parseCurrencyToPence(momoPaid) : 0;
  const nonCashRaw = cardPaidRaw + transferPaidRaw + momoPaidRaw;
  const nonCashOverpay = nonCashRaw > totalDue;
  const cardPaidValue = cardPaidRaw;
  const transferPaidValue = transferPaidRaw;
  const momoPaidValue = momoPaidRaw;
  const nonCashPaid = cardPaidValue + transferPaidValue + momoPaidValue;
  const cashDue = Math.max(totalDue - nonCashPaid, 0);
  const cashApplied = Math.min(cashTenderedValue, cashDue);
  const changeDue = Math.max(cashTenderedValue - cashDue, 0);
  const totalPaid = cashApplied + nonCashPaid;
  const balanceRemaining = Math.max(totalDue - totalPaid, 0);
  const momoMethodEnabled = hasMethod('MOBILE_MONEY');
  const needsMomoConfirmation = momoMethodEnabled && momoPaidValue > 0;
  const momoConfirmed = momoCollectionStatus === 'CONFIRMED';
  const momoSignature = `${momoPaidValue}|${momoNetwork}|${momoPayerMsisdn.trim().replace(/\s+/g, '')}`;

  useEffect(() => {
    if (!momoCollectionId) return;
    if (momoCollectionStatus === 'PENDING') return;
    if (momoCollectionSignature && momoCollectionSignature !== momoSignature) {
      resetMomoCollection();
    }
  }, [
    momoCollectionId,
    momoCollectionSignature,
    momoCollectionStatus,
    momoSignature,
    resetMomoCollection,
  ]);

  useEffect(() => {
    if (needsMomoConfirmation) return;
    if (!momoCollectionId && momoCollectionStatus === 'IDLE') return;
    resetMomoCollection();
  }, [momoCollectionId, momoCollectionStatus, needsMomoConfirmation, resetMomoCollection]);

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
  const momoReady = !needsMomoConfirmation || momoConfirmed;
  const tillReady =
    !business.requireOpenTillForSales || openShiftTillIds.includes(tillId);
  const canSubmit =
    cart.length > 0 &&
    fullyPaid &&
    !hasPaymentError &&
    momoReady &&
    discountApprovalReady &&
    tillReady &&
    (!requiresCustomer || customerId);
  const errorParam = searchParams.get('error');

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isField =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT');

      if (event.key === 'F2') {
        event.preventDefault();
        barcodeRef.current?.focus();
        return;
      }
      if (event.key === 'F3') {
        event.preventDefault();
        productSearchRef.current?.focus();
        return;
      }
      if (event.key === 'F4') {
        event.preventDefault();
        productSearchRef.current?.focus();
        return;
      }
      if (event.key === 'F8') {
        event.preventDefault();
        cashRef.current?.focus();
        return;
      }
      if (event.key === 'F9') {
        event.preventDefault();
        if (cart.length > 0) {
          setShowParkModal(true);
        }
        return;
      }
      if (!isField && event.key === '/') {
        event.preventDefault();
        barcodeRef.current?.focus();
        return;
      }
      if (event.ctrlKey && event.key === 'Enter') {
        event.preventDefault();
        if (canSubmit) {
          formRef.current?.requestSubmit();
        }
        return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        handleUndo();
        return;
      }
      if (event.ctrlKey && event.key === 'Backspace') {
        event.preventDefault();
        const lastLine = cart[cart.length - 1];
        if (lastLine) {
          removeLine(lastLine.id);
        }
        return;
      }
      if (event.key === 'Delete' && activeLineId) {
        event.preventDefault();
        removeLine(activeLineId);
        return;
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'p') {
        if (lastReceiptId) {
          event.preventDefault();
          window.open(`/receipts/${lastReceiptId}`, '_blank', 'noopener');
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setShowKeyboardHelp(false);
        return;
      }
      if (!isField && event.key === '?') {
        event.preventDefault();
        setShowKeyboardHelp((prev) => !prev);
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeLineId, canSubmit, cart, handleUndo, lastReceiptId, removeLine]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && barcodeRef.current && target === barcodeRef.current) return;
      const isEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT');
      const key = event.key;
      const now = Date.now();
      const state = scanBufferRef.current;

      if (key === 'Enter') {
        if (state.active && state.value.length >= 4) {
          event.preventDefault();
          const code = state.value;
          state.value = '';
          state.fastCount = 0;
          state.active = false;
          if (state.timer) clearTimeout(state.timer);
          handleBarcodeScan(code);
        } else {
          state.value = '';
          state.fastCount = 0;
          state.active = false;
        }
        return;
      }

      if (key.length !== 1) return;

      const delta = state.lastTime ? now - state.lastTime : 0;
      if (delta > 200) {
        state.value = '';
        state.fastCount = 0;
        state.active = false;
      }
      if (delta > 0 && delta < 50) {
        state.fastCount += 1;
      } else {
        state.fastCount = 0;
      }
      if (state.fastCount >= 2) {
        state.active = true;
      }

      state.value += key;
      state.lastTime = now;

      if (state.active && (!isEditable || target !== barcodeRef.current)) {
        event.preventDefault();
      }

      if (state.timer) clearTimeout(state.timer);
      state.timer = setTimeout(() => {
        state.value = '';
        state.fastCount = 0;
        state.active = false;
      }, 250);
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleBarcodeScan]);

  return (
    <div className="grid gap-6 md:grid-cols-[3fr_1fr]">
      <div className="space-y-4">
        {/* ── Scan / Search bar ─────────────────────────────── */}
        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                  <svg className="h-5 w-5 text-black/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                </div>
                <input
                  className="input pl-10 text-lg font-mono tracking-wider"
                  ref={barcodeRef}
                  autoFocus
                  value={barcode}
                  onChange={(event) => setBarcode(event.target.value)}
                  onKeyDown={handleBarcodeKey}
                  onFocus={(event) => event.currentTarget.select()}
                  autoComplete="off"
                  placeholder="Scan barcode…"
                />
              </div>
            </div>

            <div className="text-center text-xs text-black/30 font-semibold">OR</div>

            <div className="flex-1 min-w-[200px] relative">
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
                }}
                onFocus={() => {
                  setProductDropdownOpen(true);
                }}
                onBlur={() => {
                  setTimeout(() => setProductDropdownOpen(false), 200);
                }}
                placeholder="Type product name…"
                autoComplete="off"
              />
              {productDropdownOpen && productSearch.trim() && (
                <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-black/10 bg-white shadow-xl">
                  {filteredProducts.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-black/50">
                      No products match &ldquo;{productSearch}&rdquo;
                      <button
                        type="button"
                        className="ml-2 font-semibold text-emerald-600 hover:underline"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { openQuickAdd(); setProductSearch(''); }}
                      >
                        Create new
                      </button>
                    </div>
                  ) : (
                    filteredProducts.map((product) => {
                      const base = product.units.find((u) => u.isBaseUnit) ?? product.units[0];
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
                            if (!base || outOfStock) return;
                            addToCart({ productId: product.id, unitId: base.id, qtyInUnit: 1 });
                            setProductId(product.id);
                            setUnitId(base.id);
                            setProductSearch('');
                            setProductDropdownOpen(false);
                            playBeep(true);
                            barcodeRef.current?.focus();
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
                    })
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {undoStack.length > 0 && (
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
            <div className="mt-3 rounded-lg border border-rose/30 bg-rose/5 px-3 py-2 text-sm text-rose flex items-center justify-between">
              <span>{barcodeAlert}</span>
              <button
                type="button"
                className="btn-secondary text-xs ml-3"
                onClick={() => openQuickAdd(pendingScan ?? '')}
              >
                Create product
              </button>
            </div>
          )}
          {stockAlert && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
              {stockAlert}
            </div>
          )}
        </div>

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
            <div className="rounded-2xl bg-gradient-to-r from-accent to-accent/80 px-4 py-4 text-white shadow-lg animate-in fade-in">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold">Sale Complete!</div>
                    <div className="text-sm opacity-90">{formatMoney(saleSuccess.totalPence, business.currency)} — Ready for next customer</div>
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
                    onClick={() => setSaleSuccess(null)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Sale error */}
          {saleError && (
            <div className="rounded-lg border border-rose/40 bg-rose/10 px-3 py-2 text-sm text-rose flex items-center justify-between">
              <span>{saleError}</span>
              <button type="button" className="text-xs font-semibold ml-2" onClick={() => setSaleError(null)}>✕</button>
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
                <div className="text-sm font-medium text-black/50">Scan a barcode or search a product</div>
                <div className="mt-1 text-xs text-black/30">Items will appear here instantly</div>
              </div>
            ) : (
              <div className="divide-y divide-black/5">
                {cartDetails.map((line, index) => {
                  const isActive = activeLineId === line.id;
                  return (
                    <div
                      key={line.id}
                      className={`flex items-center gap-3 px-4 py-3 transition-colors ${isActive ? 'bg-accentSoft/50' : 'hover:bg-black/[.02]'}`}
                      onClick={() => setActiveLineId(line.id)}
                    >
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-black/5 text-xs font-bold text-black/40">
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm truncate">{line.product.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-black/40">{formatMoney(line.unitPrice, business.currency)} × {line.unit.name}</span>
                          {line.promoLabel && <span className="text-[10px] text-emerald-600 font-medium">{line.promoLabel}</span>}
                          {(line.lineDiscount > 0) && <span className="text-[10px] text-rose-500">-{formatMoney(line.lineDiscount, business.currency)}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
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
                          className="w-12 rounded-lg border border-black/10 bg-white px-1 py-1 text-center text-sm font-bold"
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
                      <div className="w-20 text-right flex-shrink-0">
                        <div className="text-sm font-bold">{formatMoney(line.total, business.currency)}</div>
                      </div>
                      <button
                        type="button"
                        className="flex-shrink-0 rounded-lg p-2 text-black/20 hover:text-rose-500 hover:bg-rose-50 transition"
                        onClick={(e) => { e.stopPropagation(); removeLine(line.id); }}
                        title="Remove"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
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
          <div className="card p-4 space-y-4">
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
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {(['CASH', 'CARD', 'TRANSFER', 'MOBILE_MONEY'] as PaymentMethod[]).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => togglePaymentMethod(method)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${hasMethod(method) ? (method === 'MOBILE_MONEY' ? 'bg-yellow-500 text-white' : 'bg-accent text-white') : 'bg-black/5 text-black/50 hover:bg-black/10'}`}
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

            {/* Customer */}
            <div className={`flex items-center gap-3 ${requiresCustomer && !customerId ? 'rounded-lg border-2 border-amber-400 bg-amber-50 p-3' : ''}`}>
              <div className="flex-1">
                <label className="label">{requiresCustomer ? 'Customer (required)' : 'Customer'}</label>
                <select
                  className="input"
                  name="customerId"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                >
                  <option value="">{requiresCustomer ? 'Select a customer…' : 'Walk-in / None'}</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.name}</option>
                  ))}
                </select>
              </div>
              <Link className="btn-secondary text-xs whitespace-nowrap mt-5" href="/customers">+ New</Link>
            </div>

            {/* Order discount */}
            <div className="flex flex-wrap items-center gap-3">
              <label className="label whitespace-nowrap">Order Discount</label>
              <select
                className="input w-24"
                value={orderDiscountType}
                onChange={(e) => { const t = e.target.value as DiscountType; setOrderDiscountType(t); if (t === 'NONE') setOrderDiscountInput(''); }}
              >
                <option value="NONE">None</option>
                <option value="PERCENT">%</option>
                <option value="AMOUNT">Amount</option>
              </select>
              <input
                className="input w-28"
                type="number"
                min={0}
                step={orderDiscountType === 'PERCENT' ? '1' : '0.01'}
                inputMode="decimal"
                value={orderDiscountInput}
                onChange={(e) => setOrderDiscountInput(e.target.value)}
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
                    onChange={(e) => setDiscountReasonCode(e.target.value)}
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
                    onChange={(e) => setDiscountReason(e.target.value)}
                    placeholder="Reason details"
                  />
                  <input
                    className="input"
                    type="password"
                    value={discountManagerPin}
                    onChange={(e) => setDiscountManagerPin(e.target.value)}
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
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {[1, 2, 5, 10, 20, 50, 100, 200].map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        className="rounded-md border border-black/10 bg-white px-2 py-0.5 text-[11px] font-semibold hover:bg-black/5"
                        onClick={() => setCashTendered(String(amount))}
                      >
                        {formatMoney(amount * 100, business.currency)}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
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
                  <button
                    type="button"
                    className="btn-secondary mt-1.5 w-full text-xs"
                    onClick={() => handleInitiateMomoCollection().catch(() => null)}
                    disabled={
                      isInitiatingMomo ||
                      !momoMethodEnabled ||
                      parseCurrencyToPence(momoPaid) <= 0 ||
                      !momoPayerMsisdn.trim()
                    }
                  >
                    {isInitiatingMomo ? 'Requesting collection...' : 'Request MoMo Collection'}
                  </button>
                  <div className="mt-1.5 text-[11px] text-black/60">
                    Status:{' '}
                    <span
                      className={
                        momoCollectionStatus === 'CONFIRMED'
                          ? 'font-semibold text-emerald-700'
                          : momoCollectionStatus === 'PENDING'
                            ? 'font-semibold text-amber-700'
                            : momoCollectionStatus === 'FAILED' || momoCollectionStatus === 'TIMEOUT'
                              ? 'font-semibold text-rose-700'
                              : 'font-semibold text-black/50'
                      }
                    >
                      {momoCollectionStatus}
                    </span>
                    {momoRef ? ` | Ref: ${momoRef}` : ''}
                  </div>
                  {momoCollectionError ? (
                    <div className="mt-1 text-[11px] font-medium text-rose-700">{momoCollectionError}</div>
                  ) : null}
                </div>
              )}
            </div>

            {/* Validation alerts */}
            {requiresCustomer && !customerId && (
              <div className="text-sm text-amber-700 font-medium">Select a customer for credit or part-paid sales.</div>
            )}
            {hasPaymentError && (
              <div className="text-sm text-amber-700 font-medium">Card/transfer/MoMo amounts cannot exceed the total due.</div>
            )}
            {!tillReady && (
              <div className="text-sm text-amber-700 font-medium">
                Open this till shift before recording sales.
              </div>
            )}
            {needsMomoConfirmation && !momoConfirmed && (
              <div className="text-sm text-amber-700 font-medium">
                MoMo payment must be confirmed before completing this sale.
              </div>
            )}
            {requiresDiscountApproval && !discountApprovalReady && (
              <div className="text-sm text-amber-700 font-medium">
                High discount requires manager PIN and reason before sale completion.
              </div>
            )}
            {paymentStatus === 'PAID' && !fullyPaid && (
              <div className="text-sm text-amber-700 font-medium">Full payment required. Enter enough cash or switch to Part Paid/Unpaid.</div>
            )}

            <div className="flex gap-2">
              <button className="btn-primary flex-1 text-lg py-3" type="submit" disabled={!canSubmit || isCompletingSale}>
                {isCompletingSale ? 'Processing…' : `Complete Sale — ${formatMoney(totalDue, business.currency)}`}
              </button>
              {cart.length > 0 && (
                <button
                  type="button"
                  className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-100 transition"
                  onClick={() => setShowParkModal(true)}
                  title="Park this sale and serve another customer"
                >
                  <svg className="h-5 w-5 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  <span className="text-[10px]">Park</span>
                </button>
              )}
            </div>
          </div>
        </form>

        {/* Park modal */}
        {showParkModal && (
          <ParkModal
            itemCount={cart.length}
            onPark={(label) => { parkCurrentCart(label); setShowParkModal(false); }}
            onClose={() => setShowParkModal(false)}
          />
        )}
      </div>

      {/* ── Summary sidebar ─────────────────────────────── */}
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
        onRecallParked={(id) => { recallParkedCart(id); setShowParkedPanel(false); }}
        onDeleteParked={deleteParkedCart}
      />

      <KeyboardHelpModal
        show={showKeyboardHelp}
        onClose={() => setShowKeyboardHelp(false)}
      />
    </div>
  );
}
