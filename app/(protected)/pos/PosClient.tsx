'use client';

import { useMemo, useState, useEffect, useRef, useTransition } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { formatMoney } from '@/lib/format';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';
import { createSaleAction } from '@/app/actions/sales';
import { quickCreateProductAction } from '@/app/actions/products';

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
  units: UnitDto[];
  onHandBase: number;
};

type PosClientProps = {
  business: { currency: string; vatEnabled: boolean };
  store: { id: string; name: string };
  tills: { id: string; name: string }[];
  products: ProductDto[];
  customers: { id: string; name: string }[];
  units: { id: string; name: string }[];
};

type CartLine = {
  id: string;
  productId: string;
  unitId: string;
  qtyInUnit: number;
  discountType?: DiscountType;
  discountValue?: string;
};

type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER';
type DiscountType = 'NONE' | 'PERCENT' | 'AMOUNT';

const CART_STORAGE_KEY = 'pos.savedCart';
const CART_CUSTOMER_KEY = 'pos.savedCustomer';

export default function PosClient({ business, store, tills, products, customers, units }: PosClientProps) {
  const searchParams = useSearchParams();
  const safeUnits = units ?? [];
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
  const [stockAlert, setStockAlert] = useState<string | null>(null);
  const [barcodeAlert, setBarcodeAlert] = useState<string | null>(null);
  const [orderDiscountType, setOrderDiscountType] = useState<DiscountType>('NONE');
  const [orderDiscountInput, setOrderDiscountInput] = useState('');
  const [lastReceiptId, setLastReceiptId] = useState('');
  const barcodeRef = useRef<HTMLInputElement>(null);
  const productRef = useRef<HTMLSelectElement>(null);
  const unitRef = useRef<HTMLSelectElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
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
  const [quickAddError, setQuickAddError] = useState<string | null>(null);
  const [quickName, setQuickName] = useState('');
  const [quickSku, setQuickSku] = useState('');
  const [quickBarcode, setQuickBarcode] = useState('');
  const [quickBaseUnitId, setQuickBaseUnitId] = useState(safeUnits[0]?.id ?? '');
  const [quickPackagingUnitId, setQuickPackagingUnitId] = useState('');
  const [quickPackagingConversion, setQuickPackagingConversion] = useState('1');
  const [quickSellPrice, setQuickSellPrice] = useState('');
  const [quickCost, setQuickCost] = useState('');
  const [quickVatRate, setQuickVatRate] = useState('0');
  const [pendingScan, setPendingScan] = useState<string | null>(null);
  const [isCreating, startTransition] = useTransition();
  const [productSearch, setProductSearch] = useState('');
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const productSearchRef = useRef<HTMLInputElement>(null);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [undoStack, setUndoStack] = useState<CartLine[][]>([]);
  const maxUndoSteps = 10;
  const [cartRestored, setCartRestored] = useState(false);
  const cartInitialized = useRef(false);

  const pushUndo = (currentCart: CartLine[]) => {
    setUndoStack((prev) => [...prev.slice(-(maxUndoSteps - 1)), currentCart]);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previousCart = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setCart(previousCart);
    playBeep(true);
  };

  const playBeep = (success: boolean) => {
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
  };

  const selectedProduct = useMemo(
    () => productOptions.find((product) => product.id === productId),
    [productOptions, productId]
  );
  const selectedUnits = selectedProduct?.units ?? [];
  const selectedUnit = selectedUnits.find((unit) => unit.id === unitId) ?? selectedUnits[0];

  const parseCurrencyToPence = (value: string) => {
    const trimmed = value.replace(/,/g, '').trim();
    if (!trimmed) return 0;
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? 0 : Math.round(parsed * 100);
  };

  const parsePercent = (value: string) => {
    const trimmed = value.replace(/,/g, '').trim();
    if (!trimmed) return 0;
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const computeDiscount = (subtotal: number, type?: DiscountType, value?: string) => {
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
  };

  const resetQuickForm = () => {
    setQuickName('');
    setQuickSku('');
    setQuickBarcode('');
    setQuickBaseUnitId(safeUnits[0]?.id ?? '');
    setQuickPackagingUnitId('');
    setQuickPackagingConversion('1');
    setQuickSellPrice('');
    setQuickCost('');
    setQuickVatRate('0');
  };

  const openQuickAdd = (barcodeValue?: string) => {
    setQuickAddOpen(true);
    setQuickAddError(null);
    resetQuickForm();
    if (barcodeValue) {
      setQuickBarcode(barcodeValue);
    }
  };

  const handleQuickCreate = () => {
    setQuickAddError(null);
    if (!quickName.trim()) {
      setQuickAddError('Product name is required.');
      return;
    }
    if (!quickBaseUnitId) {
      setQuickAddError('Select a base unit.');
      return;
    }
    const selling = parseCurrencyToPence(quickSellPrice);
    const cost = parseCurrencyToPence(quickCost);
    if (selling <= 0 || cost <= 0) {
      setQuickAddError('Enter selling price and cost.');
      return;
    }
    startTransition(async () => {
      try {
        const created = await quickCreateProductAction({
          name: quickName.trim(),
          sku: quickSku.trim() || null,
          barcode: quickBarcode.trim() || null,
          sellingPriceBasePence: selling,
          defaultCostBasePence: cost,
          vatRateBps: Math.max(0, parseInt(quickVatRate, 10) || 0),
          baseUnitId: quickBaseUnitId,
          packagingUnitId: quickPackagingUnitId || null,
          packagingConversion: parseInt(quickPackagingConversion, 10) || 1
        });
        setQuickAddOpen(false);
        setQuickAddError(null);
        setProductId(created.id);
        const baseUnit = created.units.find((unit) => unit.isBaseUnit) ?? created.units[0];
        setUnitId(baseUnit?.id ?? '');
        setProductOptions((prev) => [...prev, created]);
        if (pendingScan || quickBarcode.trim()) {
          const targetBarcode = pendingScan ?? quickBarcode.trim();
          if (targetBarcode && created.barcode === targetBarcode) {
            addToCart({ productId: created.id, unitId: baseUnit?.id ?? '', qtyInUnit: 1 });
          }
        }
        setPendingScan(null);
        resetQuickForm();
        setBarcodeAlert(null);
        setBarcode('');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to create product.';
        setQuickAddError(message);
      }
    });
  };

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

  const getProduct = (id: string) => productOptions.find((product) => product.id === id);
  const getUnit = (product: ProductDto | undefined, unitIdValue: string) =>
    product?.units.find((unit) => unit.id === unitIdValue);

  const getAvailableBase = (targetProductId: string, excludeLineId?: string) => {
    const product = getProduct(targetProductId);
    if (!product) return 0;
    const usedBase = cart.reduce((sum, line) => {
      if (line.productId !== targetProductId || line.id === excludeLineId) return sum;
      const unit = getUnit(product, line.unitId);
      if (!unit) return sum;
      return sum + line.qtyInUnit * unit.conversionToBase;
    }, 0);
    return Math.max(product.onHandBase - usedBase, 0);
  };

  const formatAvailable = (product: ProductDto, availableBase: number) => {
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
  };

  const clampQtyInUnit = (
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
  };

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
    }
    setPaymentMethods(next);
  };

  const clearQtyDraft = (lineId: string) => {
    setQtyDrafts((prev) => {
      if (!prev[lineId]) return prev;
      const next = { ...prev };
      delete next[lineId];
      return next;
    });
  };

  const removeLine = (lineId: string) => {
    pushUndo(cart);
    setCart((prev) => prev.filter((item) => item.id !== lineId));
    clearQtyDraft(lineId);
    if (activeLineId === lineId) {
      setActiveLineId(null);
    }
  };

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

  const stockDisplay = useMemo(() => {
    if (!selectedProduct) return '0';
    const baseUnit = selectedUnits.find((unit) => unit.isBaseUnit);
    const packaging = getPrimaryPackagingUnit(
      selectedUnits.map((unit) => ({ conversionToBase: unit.conversionToBase, unit }))
    );
    return formatMixedUnit({
      qtyBase: selectedProduct.onHandBase,
      baseUnit: baseUnit?.name ?? 'unit',
      baseUnitPlural: baseUnit?.pluralName,
      packagingUnit: packaging?.unit.name,
      packagingUnitPlural: packaging?.unit.pluralName,
      packagingConversion: packaging?.conversionToBase
    });
  }, [selectedProduct, selectedUnits]);

  const quickItems = useMemo(() => {
    return [...productOptions]
      .sort((a, b) => b.onHandBase - a.onHandBase)
      .slice(0, 12);
  }, [productOptions]);

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return productOptions.slice(0, 8);
    const search = productSearch.toLowerCase();
    return productOptions
      .filter((p) =>
        p.name.toLowerCase().includes(search) ||
        (p.barcode && p.barcode.includes(search))
      )
      .slice(0, 8);
  }, [productOptions, productSearch]);

  const availableForSelection = selectedProduct ? getAvailableBase(selectedProduct.id) : 0;
  const maxQtyForSelection = selectedUnit
    ? Math.floor(availableForSelection / selectedUnit.conversionToBase)
    : 0;

  const addToCart = (line: { productId: string; unitId: string; qtyInUnit: number }) => {
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
  };

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

  const handleBarcodeScan = (code: string) => {
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
  };

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
  }, [cart, productOptions, business.vatEnabled]);

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
  const nonCashRaw = cardPaidRaw + transferPaidRaw;
  const nonCashOverpay = nonCashRaw > totalDue;
  const cardPaidValue = cardPaidRaw;
  const transferPaidValue = transferPaidRaw;
  const nonCashPaid = cardPaidValue + transferPaidValue;
  const cashDue = Math.max(totalDue - nonCashPaid, 0);
  const cashApplied = Math.min(cashTenderedValue, cashDue);
  const changeDue = Math.max(cashTenderedValue - cashDue, 0);
  const totalPaid = cashApplied + nonCashPaid;
  const balanceRemaining = Math.max(totalDue - totalPaid, 0);

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
  const canSubmit =
    cart.length > 0 && fullyPaid && !hasPaymentError && (!requiresCustomer || customerId);
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
        qtyRef.current?.focus();
        return;
      }
      if (event.key === 'F8') {
        event.preventDefault();
        cashRef.current?.focus();
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
  }, [activeLineId, canSubmit, cart, lastReceiptId, undoStack]);

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
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-black/40">Point of Sale</div>
            <h2 className="text-2xl font-display font-semibold">{store.name}</h2>
          </div>
          <div className="text-right text-sm text-black/60">
            <div>Stock on hand</div>
            <div className="text-lg font-semibold text-black">{stockDisplay}</div>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-black/10 bg-white/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-black/40">Quick add product</div>
              <div className="text-sm text-black/60">Create missing barcode items on the fly.</div>
            </div>
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() => (quickAddOpen ? setQuickAddOpen(false) : openQuickAdd())}
            >
              {quickAddOpen ? 'Hide' : 'New product'}
            </button>
          </div>
          {quickAddOpen ? (
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div>
                <label className="label">Name</label>
                <input className="input" value={quickName} onChange={(e) => setQuickName(e.target.value)} />
              </div>
              <div>
                <label className="label">SKU</label>
                <input className="input" value={quickSku} onChange={(e) => setQuickSku(e.target.value)} />
              </div>
              <div>
                <label className="label">Barcode</label>
                <input className="input" value={quickBarcode} onChange={(e) => setQuickBarcode(e.target.value)} />
              </div>
              <div>
                <label className="label">Single Unit (smallest)</label>
                <select
                  className="input"
                  value={quickBaseUnitId}
                  onChange={(e) => setQuickBaseUnitId(e.target.value)}
                >
                  {safeUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-xs text-black/50">
                  Smallest unit you sell (e.g., piece, bottle, sachet).
                </div>
              </div>
              <div>
                <label className="label">Pack/Carton Unit (optional)</label>
                <select
                  className="input"
                  value={quickPackagingUnitId}
                  onChange={(e) => setQuickPackagingUnitId(e.target.value)}
                >
                  <option value="">None</option>
                  {safeUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-xs text-black/50">
                  Bigger bundle you receive or sell (e.g., carton, box).
                </div>
              </div>
              <div>
                <label className="label">Units per Pack/Carton</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={quickPackagingConversion}
                  onChange={(e) => setQuickPackagingConversion(e.target.value)}
                />
                <div className="mt-1 text-xs text-black/50">
                  How many single units are inside 1 pack/carton.
                </div>
              </div>
              <div>
                <label className="label">Selling Price (per base)</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={quickSellPrice}
                  onChange={(e) => setQuickSellPrice(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Default Cost (per base)</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={quickCost}
                  onChange={(e) => setQuickCost(e.target.value)}
                />
              </div>
              <div>
                <label className="label">VAT Rate (bps)</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={quickVatRate}
                  onChange={(e) => setQuickVatRate(e.target.value)}
                />
              </div>
              {quickAddError ? (
                <div className="md:col-span-3 rounded-xl border border-rose/30 bg-rose/10 px-3 py-2 text-sm text-rose">
                  {quickAddError}
                </div>
              ) : null}
              <div className="md:col-span-3 flex flex-wrap gap-3">
                <button type="button" className="btn-primary" onClick={handleQuickCreate} disabled={isCreating}>
                  {isCreating ? 'Creating...' : pendingScan ? 'Create & add to cart' : 'Create product'}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setQuickAddOpen(false);
                    setQuickAddError(null);
                    setPendingScan(null);
                    setBarcodeAlert(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <form action={createSaleAction} className="mt-6 space-y-6" ref={formRef}>
          <input type="hidden" name="storeId" value={store.id} />
          <input type="hidden" name="cart" value={JSON.stringify(cart)} />
          <input type="hidden" name="orderDiscountType" value={orderDiscountType} />
          <input type="hidden" name="orderDiscountValue" value={orderDiscountInput} />
          <input type="hidden" name="cashPaid" value={Math.max(0, Math.round(cashApplied))} />
          <input type="hidden" name="cardPaid" value={Math.max(0, Math.round(cardPaidValue))} />
          <input
            type="hidden"
            name="transferPaid"
            value={Math.max(0, Math.round(transferPaidValue))}
          />
          {errorParam ? (
            <div className="rounded-xl border border-rose/40 bg-rose/10 px-3 py-2 text-sm text-rose">
              {errorParam === 'customer-required'
                ? 'Select a customer for credit or part-paid sales.'
                : errorParam === 'insufficient-stock'
                ? 'One or more items exceed available stock.'
                : 'Unable to complete sale. Please review the form.'}
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Barcode Scan (Enter to add)</label>
              <input
                className="input"
                ref={barcodeRef}
                autoFocus
                value={barcode}
                onChange={(event) => setBarcode(event.target.value)}
                onKeyDown={handleBarcodeKey}
                onFocus={(event) => event.currentTarget.select()}
                autoComplete="off"
                placeholder="Scan barcode here"
              />
            </div>
            <div>
              <label className="label">Till</label>
              <select className="input" name="tillId" value={tillId} onChange={(e) => setTillId(e.target.value)}>
                {tills.map((till) => (
                  <option key={till.id} value={till.id}>
                    {till.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="relative">
              <label className="label">Product</label>
              <input
                className="input"
                ref={productSearchRef}
                value={productSearch || selectedProduct?.name || ''}
                onChange={(event) => {
                  setProductSearch(event.target.value);
                  setProductDropdownOpen(true);
                }}
                onFocus={() => {
                  setProductDropdownOpen(true);
                  setProductSearch('');
                }}
                onBlur={() => {
                  setTimeout(() => setProductDropdownOpen(false), 150);
                }}
                placeholder="Search products..."
                autoComplete="off"
              />
              {productDropdownOpen && (
                <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-black/10 bg-white shadow-lg">
                  {filteredProducts.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-black/50">No products found</div>
                  ) : (
                    filteredProducts.map((product) => {
                      const available = getAvailableBase(product.id);
                      return (
                        <button
                          key={product.id}
                          type="button"
                          className={`w-full px-3 py-2 text-left text-sm hover:bg-black/5 ${
                            product.id === productId ? 'bg-accent/10 font-semibold' : ''
                          }`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setProductId(product.id);
                            const base = product.units.find((unit) => unit.isBaseUnit) ?? product.units[0];
                            setUnitId(base?.id ?? '');
                            setQtyInUnitInput('1');
                            setProductSearch('');
                            setProductDropdownOpen(false);
                            qtyRef.current?.focus();
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <span>{product.name}</span>
                            <span className="text-xs text-black/40">
                              {formatMoney(product.sellingPriceBasePence, business.currency)}
                            </span>
                          </div>
                          {product.barcode && (
                            <div className="text-xs text-black/40">{product.barcode}</div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="label">Unit</label>
              <select
                className="input"
                name="unitId"
                ref={unitRef}
                value={unitId}
                onChange={(event) => {
                  setUnitId(event.target.value);
                  setQtyInUnitInput('1');
                }}
              >
                {selectedUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name} ({unit.conversionToBase} base)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Quantity</label>
              <input
                name="qtyInUnit"
                className="input"
                type="number"
                min={1}
                step={1}
                max={maxQtyForSelection || undefined}
                inputMode="numeric"
                ref={qtyRef}
                value={qtyInUnitInput}
                onChange={(event) => setQtyInUnitInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleAddToCart();
                  }
                }}
                onFocus={(event) => event.currentTarget.select()}
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={handleAddToCart}
              >
                Add to cart
              </button>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-black/40">Quick items</div>
                <div className="text-xs text-black/50 mt-1">Tap to add · Sorted by stock level</div>
              </div>
              <div className="flex items-center gap-2">
                {undoStack.length > 0 && (
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-black/5"
                    onClick={handleUndo}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                    Undo
                  </button>
                )}
                <div className="text-xs text-black/50 hidden md:block">F2 scan · F4 qty · F8 cash</div>
              </div>
            </div>
            <div className="mt-3 grid gap-2 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
              {quickItems.map((item) => {
                const base = item.units.find((unit) => unit.isBaseUnit) ?? item.units[0];
                const available = getAvailableBase(item.id);
                const disabled = available <= 0;
                const lowStock = available > 0 && available <= 10;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (!base) return;
                      addToCart({ productId: item.id, unitId: base.id, qtyInUnit: 1 });
                      setProductId(item.id);
                      setUnitId(base.id);
                      setQtyInUnitInput('1');
                      barcodeRef.current?.focus();
                    }}
                    className={`group relative rounded-xl border p-4 text-left transition-all active:scale-95 ${
                      disabled
                        ? 'border-black/5 bg-black/5 text-black/30 cursor-not-allowed'
                        : lowStock
                        ? 'border-amber-200 bg-amber-50 hover:border-amber-300 hover:shadow-md'
                        : 'border-black/10 bg-white hover:border-emerald-300 hover:shadow-md hover:-translate-y-0.5'
                    }`}
                  >
                    {lowStock && !disabled && (
                      <div className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-white">
                        !
                      </div>
                    )}
                    <div className="text-sm font-semibold leading-tight line-clamp-2">{item.name}</div>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="text-base font-bold text-emerald-700">
                        {formatMoney(item.sellingPriceBasePence, business.currency)}
                      </span>
                      <span className={`text-xs ${lowStock ? 'text-amber-600 font-semibold' : 'text-black/40'}`}>
                        {formatAvailable(item, available)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.2em] text-black/40">Cart</div>
              {cart.length > 0 && (
                <button
                  type="button"
                  className="text-xs text-rose-600 hover:text-rose-800 font-medium"
                  onClick={() => {
                    if (confirm('Clear the entire cart?')) {
                      pushUndo(cart);
                      setCart([]);
                      clearSavedCart();
                    }
                  }}
                >
                  Clear cart
                </button>
              )}
            </div>
            {cartRestored && (
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Previous cart restored from your last session.</span>
                <button
                  type="button"
                  className="ml-auto text-xs font-semibold text-blue-700 hover:text-blue-900"
                  onClick={() => setCartRestored(false)}
                >
                  Dismiss
                </button>
              </div>
            )}
            {stockAlert ? (
              <div className="mt-2 rounded-xl border border-amber-400 bg-amber-200 px-3 py-2 text-sm font-semibold text-amber-900">
                {stockAlert}
              </div>
            ) : null}
            {barcodeAlert ? (
              <div className="mt-2 rounded-xl border border-rose/40 bg-rose/10 px-3 py-2 text-sm text-rose">
                <div>{barcodeAlert}</div>
                <button
                  type="button"
                  className="btn-secondary mt-2 text-xs"
                  onClick={() => openQuickAdd(pendingScan ?? quickBarcode)}
                >
                  Create product
                </button>
              </div>
            ) : null}
            {cartDetails.length === 0 ? (
              <div className="mt-4 flex flex-col items-center justify-center py-8 text-center">
                <div className="rounded-full bg-black/5 p-4">
                  <svg className="h-8 w-8 text-black/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="mt-3 text-sm font-medium text-black/70">Cart is empty</div>
                <div className="mt-1 text-xs text-black/50">Scan a barcode or select a product to start</div>
              </div>
            ) : (
              <table className="table mt-3 w-full border-separate border-spacing-y-3">
                <thead>
                  <tr>
                    <th className="pb-2">Item</th>
                    <th className="pb-2">Qty</th>
                    <th className="pb-2 hidden sm:table-cell">Discount</th>
                    <th className="pb-2 hidden md:table-cell">Unit price</th>
                    <th className="pb-2">Total</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {cartDetails.map((line) => (
                    <tr key={line.id} className="rounded-xl bg-white shadow-sm">
                      <td className="px-4 py-4 text-base font-semibold">{line.product.name}</td>
                      <td className="px-4 py-4 text-sm">
                        <div className="text-xs text-black/50">{line.qtyLabel}</div>
                        <input
                          className="input mt-1"
                          type="number"
                          min={1}
                          step={1}
                          inputMode="numeric"
                          value={qtyDrafts[line.id] ?? String(line.qtyInUnit)}
                          onChange={(event) => {
                            const value = event.target.value;
                            setQtyDrafts((prev) => ({ ...prev, [line.id]: value }));
                          }}
                          onBlur={() => commitLineQty(line)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              commitLineQty(line);
                            }
                          }}
                          onFocus={(event) => {
                            setActiveLineId(line.id);
                            event.currentTarget.select();
                          }}
                        />
                      </td>
                      <td className="px-4 py-4 text-sm hidden sm:table-cell">
                        <select
                          className="input text-sm"
                          value={line.discountType ?? 'NONE'}
                          onChange={(event) => {
                            const nextType = event.target.value as DiscountType;
                            setCart((prev) =>
                              prev.map((item) =>
                                item.id === line.id
                                  ? {
                                      ...item,
                                      discountType: nextType,
                                      discountValue: nextType === 'NONE' ? '' : item.discountValue ?? ''
                                    }
                                  : item
                              )
                            );
                          }}
                          onFocus={() => setActiveLineId(line.id)}
                        >
                          <option value="NONE">None</option>
                          <option value="PERCENT">%</option>
                          <option value="AMOUNT">Amount</option>
                        </select>
                        {line.discountType && line.discountType !== 'NONE' ? (
                          <input
                            className="input mt-1 text-sm"
                            type="number"
                            min={0}
                            step={line.discountType === 'PERCENT' ? '1' : '0.01'}
                            inputMode="decimal"
                            value={line.discountValue ?? ''}
                            onChange={(event) => {
                              const value = event.target.value;
                              setCart((prev) =>
                                prev.map((item) =>
                                  item.id === line.id ? { ...item, discountValue: value } : item
                                )
                              );
                            }}
                            onFocus={(event) => {
                              setActiveLineId(line.id);
                              event.currentTarget.select();
                            }}
                          />
                        ) : null}
                        {line.promoLabel ? (
                          <div className="mt-1 text-xs text-emerald-700">{line.promoLabel}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 text-sm hidden md:table-cell">{formatMoney(line.unitPrice, business.currency)}</td>
                      <td className="px-4 py-4 text-base font-semibold">
                        {formatMoney(line.total, business.currency)}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          type="button"
                          className="rounded-xl bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-100 transition"
                          onClick={() => removeLine(line.id)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="label">Order Discount</label>
              <div className="flex gap-2">
                <select
                  className="input"
                  value={orderDiscountType}
                  onChange={(event) => {
                    const nextType = event.target.value as DiscountType;
                    setOrderDiscountType(nextType);
                    if (nextType === 'NONE') {
                      setOrderDiscountInput('');
                    }
                  }}
                >
                  <option value="NONE">None</option>
                  <option value="PERCENT">%</option>
                  <option value="AMOUNT">Amount</option>
                </select>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step={orderDiscountType === 'PERCENT' ? '1' : '0.01'}
                  inputMode="decimal"
                  value={orderDiscountInput}
                  onChange={(event) => setOrderDiscountInput(event.target.value)}
                  disabled={orderDiscountType === 'NONE'}
                  onFocus={(event) => event.currentTarget.select()}
                  placeholder={orderDiscountType === 'PERCENT' ? '10' : '0.00'}
                />
              </div>
              <div className="mt-1 text-xs text-black/50">
                Applies after line discounts/promos.
              </div>
            </div>
            <div className="md:col-span-2 rounded-xl border border-black/5 bg-white/70 p-3 text-xs text-black/60">
              Hotkeys: F2 barcode, F3 product, F4 quantity, F8 cash, Ctrl+Enter to tender, Delete to remove line.
            </div>
          </div>

          {/* Customer section - highlighted when required for credit sales */}
          {requiresCustomer && (
            <div className={`rounded-xl border-2 p-4 mb-4 transition-all ${
              !customerId
                ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-200'
                : 'border-emerald-400 bg-emerald-50'
            }`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                  !customerId ? 'bg-amber-400' : 'bg-emerald-500'
                }`}>
                  <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <div className={`font-semibold ${!customerId ? 'text-amber-800' : 'text-emerald-800'}`}>
                    {!customerId ? 'Customer Required' : 'Customer Selected'}
                  </div>
                  <div className="text-xs text-black/60">
                    {paymentStatus === 'UNPAID' ? 'Credit sale' : 'Part payment'} requires a customer account
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <select
                  className={`input flex-1 ${!customerId ? 'border-amber-400 focus:ring-amber-400' : ''}`}
                  name="customerId"
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                >
                  <option value="">Select a customer...</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
                <Link
                  className="btn-secondary text-xs whitespace-nowrap"
                  href="/customers"
                >
                  + New
                </Link>
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-4">
            {!requiresCustomer && (
              <div>
                <div className="flex items-center justify-between">
                  <label className="label">Customer (Optional)</label>
                  <Link className="text-xs font-semibold text-emerald-700 hover:text-emerald-900" href="/customers">
                    Add
                  </Link>
                </div>
                <select
                  className="input"
                  name="customerId"
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                >
                  <option value="">Walk-in / None</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="label">Payment Status</label>
              <select
                className="input"
                name="paymentStatus"
                value={paymentStatus}
                onChange={(event) => setPaymentStatus(event.target.value as any)}
              >
                <option value="PAID">Paid</option>
                <option value="PART_PAID">Part Paid</option>
                <option value="UNPAID">Unpaid (Credit)</option>
              </select>
            </div>
            <div>
              <label className="label">Payment Method</label>
              <div className="mt-2 flex flex-wrap gap-3 text-sm text-black/70">
                {(['CASH', 'CARD', 'TRANSFER'] as PaymentMethod[]).map((method) => (
                  <label key={method} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={hasMethod(method)}
                      onChange={() => togglePaymentMethod(method)}
                    />
                    <span>{method === 'CASH' ? 'Cash' : method === 'CARD' ? 'Card' : 'Transfer'}</span>
                  </label>
                ))}
              </div>
              <div className="mt-1 text-xs text-black/50">Select one or more methods.</div>
            </div>
            <div>
              <label className="label">Due Date</label>
              <input className="input" name="dueDate" type="date" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {hasMethod('CASH') ? (
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
                  onChange={(event) => setCashTendered(event.target.value)}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {[5, 10, 20, 50].map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      className="rounded-lg border border-black/10 bg-white px-3 py-1 text-xs font-semibold hover:bg-black/5"
                      onClick={() => setCashTendered(String(amount))}
                    >
                      {formatMoney(amount * 100, business.currency)}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                    onClick={() => setCashTendered(String(totalDue / 100))}
                  >
                    Exact
                  </button>
                </div>
                <div className="mt-2 text-xs font-semibold text-emerald-700">
                  Change due: {formatMoney(changeDue, business.currency)}
                </div>
              </div>
            ) : null}
            {hasMethod('CARD') ? (
              <div>
                <label className="label">Card Amount</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={cardPaid}
                  onChange={(event) => setCardPaid(event.target.value)}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </div>
            ) : null}
            {hasMethod('TRANSFER') ? (
              <div>
                <label className="label">Transfer Amount</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={transferPaid}
                  onChange={(event) => setTransferPaid(event.target.value)}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </div>
            ) : null}
          </div>

          {requiresCustomer && !customerId ? (
            <div className="rounded-xl border border-rose/30 bg-rose/10 px-3 py-2 text-sm text-rose">
              Select a customer for credit or part-paid sales.
            </div>
          ) : null}
          {hasPaymentError ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Card/transfer amounts cannot exceed the total due.
            </div>
          ) : null}
          {paymentStatus === 'PAID' && !fullyPaid ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Full payment required for Paid sales. Enter enough cash or use Part Paid/Unpaid.
            </div>
          ) : null}

          <button className="btn-primary w-full" type="submit" disabled={!canSubmit}>
            Complete Sale
          </button>
        </form>
      </div>

      <div className="card p-6 lg:sticky lg:top-24 lg:self-start">
        <div className="text-xs uppercase tracking-[0.25em] text-black/40">Summary</div>
        <h3 className="mt-2 text-xl font-display font-semibold">Cart Totals</h3>
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Items</span>
            <span className="font-semibold">{cartDetails.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span className="font-semibold">{formatMoney(totals.subtotal, business.currency)}</span>
          </div>
          {totals.lineDiscount > 0 ? (
            <div className="flex justify-between text-emerald-700">
              <span>Line discounts</span>
              <span className="font-semibold">- {formatMoney(totals.lineDiscount, business.currency)}</span>
            </div>
          ) : null}
          {totals.promoDiscount > 0 ? (
            <div className="flex justify-between text-emerald-700">
              <span>Promos</span>
              <span className="font-semibold">- {formatMoney(totals.promoDiscount, business.currency)}</span>
            </div>
          ) : null}
          {orderDiscount > 0 ? (
            <div className="flex justify-between text-emerald-700">
              <span>Order discount</span>
              <span className="font-semibold">- {formatMoney(orderDiscount, business.currency)}</span>
            </div>
          ) : null}
          <div className="flex justify-between text-sm text-black/60">
            <span>Net subtotal</span>
            <span className="font-semibold">{formatMoney(netAfterOrderDiscount, business.currency)}</span>
          </div>
          {business.vatEnabled ? (
            <div className="flex justify-between">
              <span>VAT</span>
              <span className="font-semibold">{formatMoney(vatTotal, business.currency)}</span>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-black/10 pt-3 text-lg">
            <span className="font-semibold">Total Due</span>
            <span className="text-2xl font-bold">{formatMoney(totalDue, business.currency)}</span>
          </div>
          {totalPaid > 0 ? (
            <div className="flex justify-between">
              <span>Paid</span>
              <span className="font-semibold">{formatMoney(totalPaid, business.currency)}</span>
            </div>
          ) : null}
          {balanceRemaining > 0 ? (
            <div className="flex justify-between text-rose">
              <span>Balance due</span>
              <span className="font-semibold">{formatMoney(balanceRemaining, business.currency)}</span>
            </div>
          ) : null}
          {changeDue > 0 ? (
            <div className="mt-4 rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-600 px-6 py-6 text-white shadow-lg ring-4 ring-emerald-200">
              <div className="text-center">
                <div className="text-sm font-medium uppercase tracking-[0.3em] opacity-90">Change Due</div>
                <div className="mt-2 text-5xl font-bold tracking-tight">
                  {formatMoney(changeDue, business.currency)}
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <div className="mt-6 rounded-xl bg-accentSoft p-3 text-xs text-black/60">
          <div className="flex items-center justify-between">
            <span>Mixed-unit display is applied across inventory, POS stock indicator, and reporting.</span>
            <button
              type="button"
              className="font-semibold text-emerald-700 hover:text-emerald-900"
              onClick={() => setShowKeyboardHelp(true)}
            >
              Shortcuts (?)
            </button>
          </div>
        </div>
      </div>

      {showKeyboardHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-display font-semibold">Keyboard Shortcuts</h3>
              <button
                type="button"
                className="rounded-lg p-1 hover:bg-black/5"
                onClick={() => setShowKeyboardHelp(false)}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div className="text-xs uppercase tracking-wide text-black/50">Navigation</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <kbd className="rounded bg-black/10 px-2 py-1 text-xs font-mono">F2</kbd>
                  <span>Barcode field</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="rounded bg-black/10 px-2 py-1 text-xs font-mono">F3</kbd>
                  <span>Product search</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="rounded bg-black/10 px-2 py-1 text-xs font-mono">F4</kbd>
                  <span>Quantity field</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="rounded bg-black/10 px-2 py-1 text-xs font-mono">F8</kbd>
                  <span>Cash field</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="rounded bg-black/10 px-2 py-1 text-xs font-mono">/</kbd>
                  <span>Focus barcode</span>
                </div>
              </div>
              <div className="mt-4 text-xs uppercase tracking-wide text-black/50">Actions</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <kbd className="rounded bg-black/10 px-2 py-1 text-xs font-mono">Ctrl+Enter</kbd>
                  <span>Complete sale</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="rounded bg-black/10 px-2 py-1 text-xs font-mono">Ctrl+Backspace</kbd>
                  <span>Remove last item</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="rounded bg-black/10 px-2 py-1 text-xs font-mono">Delete</kbd>
                  <span>Remove selected</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="rounded bg-black/10 px-2 py-1 text-xs font-mono">Ctrl+P</kbd>
                  <span>Reprint last</span>
                </div>
              </div>
              <div className="mt-4 text-xs uppercase tracking-wide text-black/50">Help</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <kbd className="rounded bg-black/10 px-2 py-1 text-xs font-mono">?</kbd>
                  <span>Toggle this help</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="rounded bg-black/10 px-2 py-1 text-xs font-mono">Esc</kbd>
                  <span>Close dialog</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn-primary mt-6 w-full"
              onClick={() => setShowKeyboardHelp(false)}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
