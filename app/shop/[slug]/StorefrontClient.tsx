'use client';

import React from 'react';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatMoney, toTitleCase, formatGhanaPhoneForDisplay } from '@/lib/format';
import { buildCartDetails, buildProductMap, formatAvailable, getUnitFromProduct, sumCartTotals, type PosCartLine } from '@/lib/payments/pos-cart';
import { resolveBrandStyles } from '@/lib/storefront-branding';
import { getPaymentInstructionDetails } from '@/lib/storefront-payments';
import type { PublicStorefront } from '@/lib/services/online-orders';
import MerchantBrandBadge from '@/components/MerchantBrandBadge';

const ALL_CATEGORIES = '__all__';
const CATALOG_PAGE_SIZE = 24;
const SEARCH_DEBOUNCE_MS = 300;
const CATALOG_SECTION_ID = 'shop-catalog';
const CART_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_CART_QTY = 999;

/** Validate a Ghana mobile number client-side before submitting to the server. */
function isValidGhanaPhone(value: string): boolean {
  const digits = value.trim().replace(/[^\d]/g, '');
  if (!digits) return false;
  let national: string | null = null;
  if (digits.startsWith('00233') && digits.length === 14) national = digits.slice(5);
  else if (digits.startsWith('233') && digits.length === 12) national = digits.slice(3);
  else if (digits.startsWith('0') && digits.length === 10) national = digits.slice(1);
  else if (digits.length === 9) national = digits;
  return national !== null && national.length === 9;
}

function SpinnerIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}

type CatalogResponse = {
  products: PublicStorefront['products'];
  total: number;
  offset: number;
  limit: number;
};

type PaymentInstructionDetails = ReturnType<typeof getPaymentInstructionDetails>;

function PackageIcon({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
    </svg>
  );
}

function ProductImage({
  src,
  fallbackSrc,
  alt,
  inStock,
  categoryName,
  priority = false,
}: {
  src: string | null;
  fallbackSrc?: string | null;
  alt: string;
  inStock: boolean;
  categoryName?: string | null;
  priority?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const effectiveSrc = src ?? fallbackSrc ?? null;
  const fallbackLabel = (() => {
    const source = (alt || categoryName || 'Item').trim();
    const initials = source
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? '')
      .join('');
    return initials || source.slice(0, 2).toUpperCase();
  })();

  if (!effectiveSrc || failed) {
    return (
      <div className={`relative flex h-full w-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_20%_15%,rgba(16,185,129,0.13),transparent_34%),linear-gradient(135deg,#fbfdff,#eef6ff_52%,#f0fdf4)] ${inStock ? '' : 'opacity-60'}`}>
        <div className="absolute inset-x-3 top-3 truncate rounded-full bg-white/60 px-2 py-1 text-center text-[8px] font-black uppercase tracking-[0.16em] text-black/35">
          {categoryName ? toTitleCase(categoryName) : 'Store pick'}
        </div>
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/80 bg-white/90 text-slate-400 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
          <PackageIcon className="h-8 w-8" />
        </div>
        <div className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-xl bg-white/75 text-[10px] font-black tracking-[0.08em] shadow-sm" style={{ color: 'var(--store-primary)' }}>
          {fallbackLabel}
        </div>
      </div>
    );
  }

  return (
    <>
      {!loaded ? (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100" aria-hidden="true" />
      ) : null}
      <Image
        src={effectiveSrc}
        alt={alt}
        fill
        loading={priority ? 'eager' : 'lazy'}
        priority={priority}
        className={`object-contain p-3 transition-transform duration-300 ${inStock ? 'group-hover:scale-[1.025]' : 'grayscale'} ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onError={() => setFailed(true)}
        onLoad={() => setLoaded(true)}
        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
      />
    </>
  );
}

function ProductCardSkeleton() {
  return <div className="h-56 animate-pulse rounded-2xl bg-white ring-1 ring-black/5" />;
}

function ShareIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.935-2.186 2.25 2.25 0 00-3.935 2.186z" />
    </svg>
  );
}

function PaymentPreviewCard({
  paymentConfig,
  currency,
  paymentDetails,
}: {
  paymentConfig: import('@/lib/storefront-payments').StorefrontPaymentConfig;
  currency: string;
  paymentDetails?: PaymentInstructionDetails;
}) {
  void currency;
  const details = paymentDetails ?? getPaymentInstructionDetails(paymentConfig);
  if (details.manual) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">Payment plan</div>
        <div className="font-semibold text-amber-950">The store will confirm payment with you</div>
        <div className="mt-1 text-xs leading-5 text-amber-800/75">Place the order now. The merchant will contact you with the exact next step.</div>
      </div>
    );
  }
  if (!details.ready) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">Payment plan</div>
        The store will share payment details after your order.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700">How you&apos;ll pay</div>
      <div className="font-semibold text-sky-950">{details.modeLabel}</div>
      {details.recipient ? (
        <div className="mt-1 text-xs text-sky-800">
          {paymentConfig.mode === 'MERCHANT_SHORTCODE' ? 'Merchant number: ' : paymentConfig.mode === 'BANK_TRANSFER' ? 'Account: ' : 'Number: '}
          <span className="font-mono font-bold">{details.recipient}</span>
        </div>
      ) : null}
      {details.recipientCaption && !details.manual ? (
        <div className="mt-0.5 text-xs text-sky-700/70">{details.recipientCaption}</div>
      ) : null}
      <div className="mt-2 rounded-xl bg-white/70 px-3 py-2 text-xs text-sky-900">
        Use the unique order reference after checkout so the merchant can confirm quickly.
      </div>
    </div>
  );
}

function CheckoutUnavailableBanner() {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">
      This shop is updating its payment details — please check back soon.
    </div>
  );
}

type ProductSelectionState = Record<string, { unitId: string; qtyInUnit: number }>;
type StorefrontProduct = PublicStorefront['products'][number];
type RecommendationProductLike = {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  publicCategoryName?: string | null;
  sellingPriceBasePence: number;
  onHandBase: number;
};

function initialSelections(storefront: PublicStorefront) {
  return storefront.products.reduce<ProductSelectionState>((acc, product) => {
    acc[product.id] = {
      unitId: product.units[0]?.id ?? '',
      qtyInUnit: 1,
    };
    return acc;
  }, {});
}

function getRecommendationCategoryKey(product: RecommendationProductLike | null | undefined) {
  if (!product) return null;
  return product.categoryId ?? product.publicCategoryName?.toLowerCase() ?? product.categoryName?.toLowerCase() ?? null;
}

function getRecommendationCategoryLabel(product: RecommendationProductLike | null | undefined) {
  if (!product) return null;
  return product.publicCategoryName ?? product.categoryName ?? null;
}

function sortRecommendationProducts(a: RecommendationProductLike, b: RecommendationProductLike) {
  const stockDifference = Number(b.onHandBase > 0) - Number(a.onHandBase > 0);
  if (stockDifference !== 0) return stockDifference;
  return b.sellingPriceBasePence - a.sellingPriceBasePence;
}

const PRODUCTS_PER_PAGE = 24;

function ProductDetailSheet({
  product,
  storefront,
  onClose,
  onAddToCart,
  selectionState,
  setSelectionState,
  cartProductIds,
  cartQtyByProductId,
  adjustCartProduct,
  primaryStyle,
}: {
  product: StorefrontProduct;
  storefront: PublicStorefront;
  onClose: () => void;
  onAddToCart: (productId: string) => void;
  selectionState: ProductSelectionState;
  setSelectionState: React.Dispatch<React.SetStateAction<ProductSelectionState>>;
  cartProductIds: Set<string>;
  cartQtyByProductId: Record<string, number>;
  adjustCartProduct: (productId: string, delta: number) => void;
  primaryStyle: React.CSSProperties;
}) {
  const selected = selectionState[product.id];
  const selectedUnit = selected ? getUnitFromProduct(product, selected.unitId) : undefined;
  const unitPrice = selectedUnit
    ? formatMoney(
        selectedUnit.sellingPricePence ?? product.sellingPriceBasePence * selectedUnit.conversionToBase,
        storefront.currency,
      )
    : formatMoney(product.sellingPriceBasePence, storefront.currency);
  const inStock = product.onHandBase > 0;
  const hasPromo = product.promoBuyQty > 0 && product.promoGetQty > 0;
  const productInCart = cartProductIds.has(product.id);
  const productCartQty = cartQtyByProductId[product.id] ?? 0;
  const displayName = toTitleCase(product.name);
  const displayCategory = product.publicCategoryName ? toTitleCase(product.publicCategoryName) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={displayName}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-t-3xl bg-white sm:rounded-3xl">
        <div className="relative h-52 w-full overflow-hidden bg-gradient-to-b from-white to-slate-50 sm:h-64">
          <ProductImage src={product.imageUrl} fallbackSrc={product.categoryImageUrl} alt={displayName} inStock={inStock} categoryName={displayCategory} priority />
          {hasPromo && inStock ? (
            <div
              className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm"
              style={primaryStyle}
            >
              Buy {product.promoBuyQty} get {product.promoGetQty} free
            </div>
          ) : null}
          {!inStock ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white/75 backdrop-blur-[1px]">
              <span className="rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm">Sold out</span>
            </div>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-black/50 shadow-sm transition hover:bg-white hover:text-ink"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4 pb-[env(safe-area-inset-bottom)]">
          {displayCategory ? (
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-black/35">{displayCategory}</div>
          ) : null}
          <h2 className="mt-1 text-xl font-black text-ink">{displayName}</h2>
          <div className="mt-1.5 text-2xl font-black text-ink">{unitPrice}</div>
          {inStock ? (
            <div className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Available for pickup
            </div>
          ) : (
            <div className="mt-1 text-xs font-semibold text-slate-400">Currently sold out</div>
          )}

          {product.storefrontDescription ? (
            <p className="mt-3 text-sm leading-relaxed text-black/65">{product.storefrontDescription}</p>
          ) : null}

          {product.units.length > 1 ? (
            <div className="mt-4">
              <div className="mb-1.5 text-xs font-semibold text-black/50">Select unit</div>
              <div className="flex flex-wrap gap-2">
                {product.units.map((unit) => {
                  const isSelected = selected?.unitId === unit.id;
                  return (
                    <button
                      key={unit.id}
                      type="button"
                      disabled={!inStock}
                      onClick={() =>
                        setSelectionState((prev) => ({
                          ...prev,
                          [product.id]: { ...(prev[product.id] ?? { qtyInUnit: 1 }), unitId: unit.id },
                        }))
                      }
                      className={`rounded-xl border px-3 py-1.5 text-sm font-semibold transition disabled:opacity-50 ${
                        isSelected
                          ? 'border-transparent text-white shadow-sm'
                          : 'border-slate-200 bg-slate-50 text-black/60 hover:border-slate-300'
                      }`}
                      style={isSelected ? { backgroundColor: 'var(--store-primary)', color: 'var(--store-primary-foreground)' } : undefined}
                    >
                      {toTitleCase(unit.name)}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-5">
            {inStock && !productInCart ? (
              <button
                type="button"
                className="flex h-12 w-full items-center justify-center rounded-2xl text-sm font-black text-white shadow-sm transition hover:brightness-105 active:scale-[0.99]"
                style={primaryStyle}
                onClick={() => { onAddToCart(product.id); onClose(); }}
              >
                Add to cart
              </button>
            ) : inStock && productInCart ? (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-2">
                <div className="px-1 pb-1.5 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">In cart</div>
                <div className="flex h-11 items-center overflow-hidden rounded-xl bg-white shadow-sm">
                  <button
                    type="button"
                    className="flex h-11 w-12 items-center justify-center text-base font-bold text-emerald-800 transition hover:bg-emerald-50"
                    onClick={() => adjustCartProduct(product.id, -1)}
                  >
                    −
                  </button>
                  <span className="flex-1 text-center text-sm font-black text-ink">{productCartQty}</span>
                  <button
                    type="button"
                    disabled={productCartQty >= MAX_CART_QTY}
                    className="flex h-11 w-12 items-center justify-center text-base font-bold text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-30"
                    onClick={() => adjustCartProduct(product.id, 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export type StorefrontCustomerProp = {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
};

export default function StorefrontClient({
  storefront,
  customer,
}: {
  storefront: PublicStorefront;
  customer?: StorefrontCustomerProp | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearchQuery = searchParams?.get('q') ?? '';
  const initialCategoryId = searchParams?.get('category') ?? ALL_CATEGORIES;
  const CART_STORAGE_KEY = `tillflow_cart_${storefront.slug}`;
  const RECENTLY_VIEWED_STORAGE_KEY = `tillflow_viewed_${storefront.slug}`;
  const [cart, setCart] = useState<PosCartLine[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(`tillflow_cart_${storefront.slug}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as { savedAt?: number; lines?: PosCartLine[] } | PosCartLine[];
      // Support both old format (plain array) and new format ({ savedAt, lines })
      const lines = Array.isArray(parsed) ? parsed : (parsed.lines ?? []);
      const savedAt = Array.isArray(parsed) ? 0 : (parsed.savedAt ?? 0);
      if (savedAt && Date.now() - savedAt > CART_TTL_MS) {
        localStorage.removeItem(`tillflow_cart_${storefront.slug}`);
        return [];
      }
      const productIds = new Set(storefront.products.map((product) => product.id));
      return lines.filter((line) => productIds.has(line.productId));
    } catch {
      return [];
    }
  });
  const [catalogProducts, setCatalogProducts] = useState<PublicStorefront['products']>(() => storefront.products);
  const [catalogTotal, setCatalogTotal] = useState(storefront.totalProductCount ?? storefront.products.length);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectionState, setSelectionState] = useState<ProductSelectionState>(() => initialSelections(storefront));
  const [selectedStoreId, setSelectedStoreId] = useState<string>(() => storefront.stores[0]?.id ?? '');
  const [customerName, setCustomerName] = useState(customer?.name ?? '');
  const [customerPhone, setCustomerPhone] = useState(customer?.phone ?? '');
  const [customerEmail, setCustomerEmail] = useState(customer?.email ?? '');
  const [customerNotes, setCustomerNotes] = useState('');
  const [network, setNetwork] = useState<'MTN' | 'TELECEL' | 'AIRTELTIGO'>('MTN');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(initialCategoryId);
  const debouncedSearchQuery = useDebouncedValue(searchQuery, SEARCH_DEBOUNCE_MS);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [mobileStep, setMobileStep] = useState<'browse' | 'cart' | 'checkout'>('browse');
  const [isMounted, setIsMounted] = useState(false);
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>([]);
  const [storefrontSessionId, setStorefrontSessionId] = useState('');
  const [detailProduct, setDetailProduct] = useState<StorefrontProduct | null>(null);
  const [qtyEditingProductId, setQtyEditingProductId] = useState<string | null>(null);
  const catalogAbortRef = useRef<AbortController | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

  function trackEvent(eventType: 'view' | 'product_view' | 'add_to_cart' | 'checkout_start', productId?: string | null, metadata?: Record<string, unknown>) {
    if (!storefrontSessionId) return;
    const payload = JSON.stringify({
      businessId: storefront.businessId,
      storeSlug: storefront.slug,
      eventType,
      productId,
      sessionId: storefrontSessionId,
      metadata,
    });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/storefront/events', new Blob([payload], { type: 'application/json' }));
        return;
      }
    } catch {}
    fetch('/api/storefront/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
  }

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), lines: cart }));
    } catch {}
  }, [cart, CART_STORAGE_KEY]);

  useEffect(() => {
    setIsMounted(true);
    try {
      const sessionKey = `tillflow_store_session_${storefront.slug}`;
      let sessionId = localStorage.getItem(sessionKey);
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        localStorage.setItem(sessionKey, sessionId);
      }
      setStorefrontSessionId(sessionId);
      const raw = localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed)) {
        setRecentlyViewed(parsed.filter((value) => typeof value === 'string').slice(0, 8));
      }
    } catch {}
  }, [RECENTLY_VIEWED_STORAGE_KEY, storefront.slug]);

  useEffect(() => {
    if (storefrontSessionId) {
      trackEvent('view', null, { productCount: catalogTotal });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storefrontSessionId]);

  const loadCatalog = useCallback(async ({ query, categoryId }: { query: string; categoryId: string }) => {
    catalogAbortRef.current?.abort();
    const controller = new AbortController();
    catalogAbortRef.current = controller;

    const trimmedQuery = query.trim();
    const params = new URLSearchParams({
      slug: storefront.slug,
      offset: '0',
      limit: String(CATALOG_PAGE_SIZE),
    });
    if (trimmedQuery) params.set('q', trimmedQuery);
    if (categoryId !== ALL_CATEGORIES) params.set('category', categoryId);

    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const response = await fetch(`/api/storefront/catalog?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Could not load products.');
      const payload = await response.json() as CatalogResponse;
      setCatalogProducts(payload.products);
      setCatalogTotal(payload.total);
    } catch (loadError) {
      if ((loadError as { name?: string } | null)?.name === 'AbortError') return;
      setCatalogError('Products could not refresh. Check your connection and try again.');
    } finally {
      if (catalogAbortRef.current === controller) {
        catalogAbortRef.current = null;
        setCatalogLoading(false);
      }
    }
  }, [storefront.slug]);

  useEffect(() => {
    void loadCatalog({ query: debouncedSearchQuery, categoryId: selectedCategoryId });
  }, [debouncedSearchQuery, loadCatalog, selectedCategoryId]);

  useEffect(() => () => {
    catalogAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams();
    const query = debouncedSearchQuery.trim();
    if (query) params.set('q', query);
    if (selectedCategoryId !== ALL_CATEGORIES) params.set('category', selectedCategoryId);
    const queryString = params.toString();
    const nextUrl = window.location.pathname + (queryString ? `?${queryString}` : '');
    if (nextUrl !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, '', nextUrl);
    }
  }, [debouncedSearchQuery, selectedCategoryId]);

  useEffect(() => {
    setSelectionState((prev) => {
      const next = { ...prev };
      for (const product of catalogProducts) {
        if (!next[product.id]) {
          next[product.id] = { unitId: product.units[0]?.id ?? '', qtyInUnit: 1 };
        }
      }
      return next;
    });
  }, [catalogProducts]);

  const selectedStore = useMemo(
    () => storefront.stores.find((store) => store.id === selectedStoreId) ?? null,
    [storefront.stores, selectedStoreId],
  );

  const productsForStore = useMemo(
    () =>
      catalogProducts.map((product) => ({
        ...product,
        onHandBase: selectedStoreId ? product.onHandByStore[selectedStoreId] ?? 0 : product.onHandBase,
      })),
    [catalogProducts, selectedStoreId],
  );

  const categories = useMemo(() => storefront.categories ?? [], [storefront.categories]);
  const categorySuggestions = useMemo(() => categories.slice(0, 3), [categories]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId],
  );

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = productsForStore.filter((p) => {
      if (selectedCategoryId !== ALL_CATEGORIES && p.publicCategoryId !== selectedCategoryId) {
        return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.categoryName?.toLowerCase() ?? '').includes(q) ||
        p.publicCategoryName.toLowerCase().includes(q)
      );
    });
    return filtered.sort((a, b) => {
      if (a.onHandBase > 0 && b.onHandBase <= 0) return -1;
      if (a.onHandBase <= 0 && b.onHandBase > 0) return 1;
      return 0;
    });
  }, [productsForStore, searchQuery, selectedCategoryId]);

  const hasMoreProducts = catalogProducts.length < catalogTotal;
  const pagedProducts = filteredProducts;

  function handleSearch(value: string) {
    setSearchQuery(value);
  }

  function handleCategoryChange(nextId: string) {
    setSelectedCategoryId(nextId);
  }

  function scrollCatalogToTop() {
    if (typeof document === 'undefined') return;
    const catalogSection = document.getElementById(CATALOG_SECTION_ID);
    if (catalogSection) {
      catalogSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function handleBrowseProducts() {
    setMobileStep('browse');
    window.setTimeout(() => scrollCatalogToTop(), 0);
  }

  async function loadMoreProducts() {
    if (catalogLoading || !hasMoreProducts) return;
    const params = new URLSearchParams({
      slug: storefront.slug,
      offset: String(catalogProducts.length),
      limit: String(CATALOG_PAGE_SIZE),
    });
    const query = searchQuery.trim();
    if (query) params.set('q', query);
    if (selectedCategoryId !== ALL_CATEGORIES) params.set('category', selectedCategoryId);
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const response = await fetch(`/api/storefront/catalog?${params.toString()}`);
      if (!response.ok) throw new Error('Could not load products.');
      const payload = await response.json() as CatalogResponse;
      setCatalogProducts((prev) => {
        const seen = new Set(prev.map((product) => product.id));
        return [...prev, ...payload.products.filter((product) => !seen.has(product.id))];
      });
      setCatalogTotal(payload.total);
    } catch {
      setCatalogError('More products could not load. Check your connection and try again.');
    } finally {
      setCatalogLoading(false);
    }
  }

  const loadMoreFnRef = useRef(loadMoreProducts);
  loadMoreFnRef.current = loadMoreProducts;

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || !hasMoreProducts) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMoreFnRef.current();
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMoreProducts]);

  function rememberViewedProduct(productId: string) {
    setRecentlyViewed((prev) => {
      const next = [productId, ...prev.filter((id) => id !== productId)].slice(0, 8);
      try {
        localStorage.setItem(RECENTLY_VIEWED_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  function scrollToProduct(productId: string) {
    if (typeof document === 'undefined') return;
    document.getElementById(`product-${productId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }

  async function handleShareStore() {
    if (typeof window === 'undefined') return;
    const shareUrl = window.location.href;
    const sharePaymentHint = (() => {
      const mode = storefront.paymentConfig?.mode;
      if (mode === 'MOMO_NUMBER' || mode === 'MERCHANT_SHORTCODE') return 'browse and pay with MoMo';
      if (mode === 'BANK_TRANSFER') return 'browse and pay via bank transfer';
      return 'browse and place your order';
    })();
    const message = `Shop at ${storefront.name} — ${sharePaymentHint}: ${shareUrl}`;

    if (typeof navigator !== 'undefined' && (navigator as Navigator & { share?: unknown }).share) {
      try {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
          title: storefront.name,
          text: message,
          url: shareUrl,
        });
        return;
      } catch {
        // user cancelled — fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(message);
      setShareToast('Store link copied to clipboard');
      window.setTimeout(() => setShareToast(null), 2500);
    } catch {
      setShareToast('Could not share or copy link');
      window.setTimeout(() => setShareToast(null), 2500);
    }
  }

  const productMap = useMemo(() => buildProductMap(productsForStore), [productsForStore]);
  const cartDetails = useMemo(
    () => buildCartDetails(cart, productMap, storefront.vatEnabled),
    [cart, productMap, storefront.vatEnabled],
  );
  const recentlyViewedProducts = useMemo(
    () =>
      recentlyViewed
        .map((productId) => productMap.get(productId))
        .filter((product): product is NonNullable<typeof product> => Boolean(product))
        .filter((product) => product.onHandBase > 0),
    [productMap, recentlyViewed],
  );

  function handleStoreChange(nextStoreId: string) {
    if (nextStoreId === selectedStoreId) return;
    setSelectedStoreId(nextStoreId);
    setCart([]);
    setError(null);
  }
  const totals = useMemo(() => sumCartTotals(cartDetails), [cartDetails]);
  const orderTotal = totals.netSubtotal + totals.vat;
  const cartProductIds = useMemo(() => new Set(cart.map((line) => line.productId)), [cart]);
  const cartQtyByProductId = useMemo(
    () =>
      cart.reduce<Record<string, number>>((acc, line) => {
        acc[line.productId] = (acc[line.productId] ?? 0) + line.qtyInUnit;
        return acc;
      }, {}),
    [cart],
  );
  const recommendationState = useMemo(() => {
    const categoryOrder: { key: string; label: string | null }[] = [];
    const cartCategoryKeys = new Set<string>();

    for (const line of [...cart].reverse()) {
      const product = productMap.get(line.productId);
      const key = getRecommendationCategoryKey(product);
      if (!key || cartCategoryKeys.has(key)) continue;
      cartCategoryKeys.add(key);
      categoryOrder.push({ key, label: getRecommendationCategoryLabel(product) });
    }

    if (categoryOrder.length === 0) {
      return {
        products: [] as StorefrontProduct[],
        label: 'More to add',
        description: '',
      };
    }

    const sameCategoryCandidates = productsForStore
      .filter((product) => {
        const key = getRecommendationCategoryKey(product);
        return Boolean(key && cartCategoryKeys.has(key) && !cartProductIds.has(product.id) && product.onHandBase > 0);
      })
      .sort(sortRecommendationProducts);

    if (sameCategoryCandidates.length > 0) {
      const maxSuggestions = sameCategoryCandidates.length >= 4 ? 4 : 3;
      const picked: StorefrontProduct[] = [];
      const usedProductIds = new Set<string>();
      const candidatesByCategory = new Map<string, StorefrontProduct[]>();

      for (const product of sameCategoryCandidates) {
        const key = getRecommendationCategoryKey(product);
        if (!key) continue;
        const current = candidatesByCategory.get(key) ?? [];
        current.push(product);
        candidatesByCategory.set(key, current);
      }

      for (const category of categoryOrder) {
        const nextProduct = candidatesByCategory
          .get(category.key)
          ?.find((product) => !usedProductIds.has(product.id));
        if (!nextProduct) continue;
        picked.push(nextProduct);
        usedProductIds.add(nextProduct.id);
        if (picked.length >= maxSuggestions) break;
      }

      if (picked.length < maxSuggestions) {
        for (const product of sameCategoryCandidates) {
          if (usedProductIds.has(product.id)) continue;
          picked.push(product);
          usedProductIds.add(product.id);
          if (picked.length >= maxSuggestions) break;
        }
      }

      const labels = Array.from(
        new Set(picked.map((product) => getRecommendationCategoryLabel(product)).filter(Boolean)),
      ) as string[];

      return {
        products: picked,
        label: labels.length === 1 ? `More from ${labels[0]}` : 'More to add',
        description:
          labels.length === 1
            ? 'Related picks from the same category.'
            : 'A few extras from the categories already in your cart.',
      };
    }

    const fallbackCandidates = productsForStore
      .filter((product) => !cartProductIds.has(product.id) && product.onHandBase > 0)
      .sort(sortRecommendationProducts);
    const maxFallbackSuggestions = fallbackCandidates.length >= 4 ? 4 : 3;

    return {
      products: fallbackCandidates.slice(0, maxFallbackSuggestions),
      label: 'Popular in this store',
      description: 'Premium picks to round out your order.',
    };
  }, [cart, cartProductIds, productMap, productsForStore]);
  const suggestedProducts = recommendationState.products;
  const showRecentlyViewed =
    recentlyViewedProducts.length >= 2 && selectedCategoryId === ALL_CATEGORIES && searchQuery.trim().length === 0;
  const showInitialEmptySkeleton = !isMounted && storefront.products.length === 0;

  function addToCart(productId: string) {
    const current = selectionState[productId];
    const product = productMap.get(productId);
    if (!product || !current || !current.unitId) {
      setError('This product is not available right now.');
      return;
    }

    const unit = getUnitFromProduct(product, current.unitId);
    if (!unit) {
      setError('Select a valid unit before adding the product.');
      return;
    }

    if (current.qtyInUnit <= 0) {
      setError('Quantity must be at least 1.');
      return;
    }

    setError(null);
    rememberViewedProduct(productId);
    trackEvent('add_to_cart', productId);
    setCart((prev) => {
      const existing = prev.find((line) => line.productId === productId && line.unitId === current.unitId);
      if (existing) {
        return prev.map((line) =>
          line.id === existing.id
            ? { ...line, qtyInUnit: line.qtyInUnit + current.qtyInUnit }
            : line,
        );
      }

      return [
        ...prev,
        {
          id: `${productId}-${current.unitId}-${crypto.randomUUID()}`,
          productId,
          unitId: current.unitId,
          qtyInUnit: current.qtyInUnit,
        },
      ];
    });
  }

  function adjustCartProduct(productId: string, delta: number) {
    setCart((prev) => {
      const index = prev.findIndex((line) => line.productId === productId);
      if (index === -1) return prev;
      const line = prev[index];
      const nextQty = line.qtyInUnit + delta;
      if (nextQty <= 0) {
        return prev.filter((_, lineIndex) => lineIndex !== index);
      }
      if (nextQty > MAX_CART_QTY) return prev;
      return prev.map((cartLine, lineIndex) =>
        lineIndex === index ? { ...cartLine, qtyInUnit: nextQty } : cartLine,
      );
    });
  }

  async function submitCheckout() {
    if (!paymentReady) {
      setError('This shop is updating its payment details — please check back soon.');
      return;
    }

    setSubmitting(true);
    setError(null);

    if (!isValidGhanaPhone(customerPhone)) {
      setError('Enter a valid Ghana mobile number (e.g. 024 123 4567 or +233 24 123 4567).');
      setSubmitting(false);
      return;
    }

    if (!selectedStoreId) {
      setError('Choose a pickup store before checking out.');
      setSubmitting(false);
      return;
    }
    try {
      trackEvent('checkout_start', null, { items: cart.length, totalPence: orderTotal });
      const response = await fetch('/api/storefront/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          slug: storefront.slug,
          storeId: selectedStoreId,
          customerName,
          customerPhone,
          customerEmail,
          customerNotes,
          sessionId: storefrontSessionId,
          network,
          items: cart.map((line) => ({
            productId: line.productId,
            unitId: line.unitId,
            qtyInUnit: line.qtyInUnit,
          })),
        }),
      });

      const payload = await response.json().catch(() => null) as { error?: string; redirectPath?: string } | null;
      if (!response.ok) {
        setError(payload?.error ?? 'Unable to place your order right now. Please try again.');
        return;
      }

      if (!payload?.redirectPath) {
        setError('Your order may have been received, but we could not open the order page. Please try again or contact the store.');
        return;
      }

      router.push(payload.redirectPath);
      try {
        localStorage.removeItem(CART_STORAGE_KEY);
      } catch {}
    } catch (checkoutError) {
      const message = checkoutError instanceof Error ? checkoutError.message : '';
      const isNetworkFailure = /load failed|failed to fetch|network|fetch/i.test(message);
      setError(
        isNetworkFailure
          ? 'Could not reach the store checkout. Check your connection and try again.'
          : 'Unable to place your order right now. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  const storefrontTitle = storefront.headline || storefront.name;
  const storefrontTitleSizeClass =
    storefrontTitle.length > 34
      ? 'text-[1.05rem] sm:text-xl lg:text-2xl'
      : storefrontTitle.length > 22
        ? 'text-lg sm:text-2xl lg:text-3xl'
        : 'text-xl sm:text-3xl lg:text-4xl';
  const storefrontBranding = {
    businessName: storefront.name,
    logoUrl: storefront.branding.logoUrl,
    logoWidth: storefront.branding.logoWidth,
    logoHeight: storefront.branding.logoHeight,
    brandCompactLogoUrl: storefront.branding.compactLogoUrl,
    brandCompactLogoWidth: storefront.branding.compactLogoWidth,
    brandCompactLogoHeight: storefront.branding.compactLogoHeight,
    brandSquareLogoUrl: storefront.branding.squareLogoUrl,
    brandSquareLogoWidth: storefront.branding.squareLogoWidth,
    brandSquareLogoHeight: storefront.branding.squareLogoHeight,
    brandInitials: storefront.branding.initials,
    brandPrimaryColor: storefront.branding.brandPrimaryColor ?? storefront.branding.primaryColor,
    brandCompactMode: storefront.branding.compactMode,
    brandLogoBackground: storefront.branding.logoBackground,
    storefrontLogoUrl: storefront.branding.logoUrl,
    storefrontPrimaryColor: storefront.branding.primaryColor,
    storefrontTagline: storefront.branding.tagline,
  } as const;
  const cartItemCount = cartDetails.length;
  const cartUnitCount = cart.reduce((sum, line) => sum + line.qtyInUnit, 0);
  const paymentDetails = useMemo(
    () => getPaymentInstructionDetails(storefront.paymentConfig),
    [storefront.paymentConfig],
  );
  const paymentReady = paymentDetails.ready;
  const checkoutReady =
    paymentReady &&
    cart.length > 0 &&
    customerName.trim().length > 0 &&
    customerPhone.trim().length > 0;
  const brandStyles = resolveBrandStyles(storefront.branding);
  const primaryStyle: React.CSSProperties = {
    backgroundColor: 'var(--store-primary)',
    color: 'var(--store-primary-foreground)',
  };
  const heroStyle: React.CSSProperties = {
    backgroundColor: '#0b2f6f',
    backgroundImage:
      'radial-gradient(circle at 18% 0%, rgba(255,255,255,0.24), transparent 32%), radial-gradient(circle at 88% 18%, rgba(16,185,129,0.18), transparent 28%), linear-gradient(135deg, #061b45 0%, var(--store-primary) 46%, #0f4f9f 100%)',
    color: 'var(--store-primary-foreground)',
  };
  const merchProducts = productsForStore.filter((product) => product.onHandBase > 0);
  const featuredProducts = merchProducts
    .filter((product) => product.imageUrl || product.promoBuyQty > 0 || product.publicCategoryPriority <= 30)
    .slice(0, 8);

  // Payment mode hint badge shown in hero
  const paymentModeHint = (() => {
    const mode = storefront.paymentConfig?.mode;
    if (!mode) return null;
    if (mode === 'MOMO_NUMBER') return `Accepts MoMo${storefront.paymentConfig.momoNetwork ? ` · ${storefront.paymentConfig.momoNetwork}` : ''}`;
    if (mode === 'MERCHANT_SHORTCODE') return `Pay with MoMo${storefront.paymentConfig.momoNetwork ? ` · ${storefront.paymentConfig.momoNetwork}` : ''}`;
    if (mode === 'BANK_TRANSFER') return 'Bank transfer';
    if (mode === 'MANUAL_CONFIRMATION') return 'Payment details shared after order';
    return null;
  })();

  return (
    <main
      id="shop-main"
      className="min-h-screen bg-slate-50"
      style={brandStyles.cssVars as React.CSSProperties}
    >
      {/* ── STORE HERO ─────────────────────────────────────── */}
      <header className="relative overflow-hidden pt-[env(safe-area-inset-top)]" style={heroStyle}>
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent_42%),linear-gradient(0deg,rgba(2,6,23,0.18),transparent_45%)]" aria-hidden="true" />
        <div className="absolute -left-16 top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" aria-hidden="true" />
        <div className="relative z-10 mx-auto max-w-screen-lg px-4 py-4 sm:px-6 sm:py-6">
          <div className="flex items-start gap-3 sm:gap-4">
            <MerchantBrandBadge branding={storefrontBranding} surface="storefront-hero" />
            <div className="min-w-0 flex-1">
              <h1 className={`line-clamp-2 max-w-[15rem] overflow-hidden break-normal font-display font-black leading-[1.08] sm:max-w-xl ${storefrontTitleSizeClass}`} style={{ color: 'var(--brand-primary-foreground)', overflowWrap: 'normal', wordBreak: 'normal', hyphens: 'none' }}>
                {storefrontTitle}
              </h1>
              {storefront.branding.tagline && (
                <p className="mt-1 line-clamp-1 text-[11px] sm:text-sm" style={{ color: 'var(--brand-primary-foreground)', opacity: 0.76 }}>
                  {storefront.branding.tagline}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] sm:gap-2 sm:text-xs">
                {storefront.openStatus ? (
                  <span className="inline-flex min-h-7 items-center gap-1.5 rounded-lg border border-white/[0.12] bg-white/[0.14] px-2.5 py-1 font-semibold shadow-sm backdrop-blur" style={{ color: 'var(--brand-primary-foreground)' }}>
                    <span className={`h-1.5 w-1.5 rounded-full ${storefront.openStatus.isOpen ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    {storefront.openStatus.shortLabel}
                    {storefront.openStatus.detail ? ` · ${storefront.openStatus.detail}` : ''}
                  </span>
                ) : null}
                {(selectedStore?.phone ?? storefront.phone) ? (
                  <a
                    href={`tel:${selectedStore?.phone ?? storefront.phone ?? ''}`}
                    className="inline-flex min-h-7 items-center gap-1.5 rounded-lg border border-white/[0.12] bg-white/[0.14] px-2.5 py-1 font-semibold shadow-sm backdrop-blur transition hover:bg-white/20"
                    style={{ color: 'var(--brand-primary-foreground)', opacity: 0.9 }}
                  >
                    <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.272.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                    </svg>
                    {formatGhanaPhoneForDisplay(selectedStore?.phone ?? storefront.phone ?? '')}
                  </a>
                ) : null}
                {(selectedStore?.address ?? storefront.address) ? (
                  <span className="inline-flex min-h-7 items-center gap-1.5 rounded-lg border border-white/[0.12] bg-white/[0.14] px-2.5 py-1 font-semibold shadow-sm backdrop-blur" style={{ color: 'var(--brand-primary-foreground)', opacity: 0.88 }}>
                    <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                    </svg>
                    <span className="truncate">{selectedStore?.address ?? storefront.address}</span>
                  </span>
                ) : null}
                <span className="inline-flex min-h-7 items-center gap-1.5 rounded-lg border border-white/[0.12] bg-white/[0.14] px-2.5 py-1 font-semibold shadow-sm backdrop-blur" style={{ color: 'var(--brand-primary-foreground)', opacity: 0.86 }}>
                  <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Pickup available
                </span>
                {paymentModeHint ? (
                  <span className="inline-flex min-h-7 items-center gap-1.5 rounded-lg border border-white/[0.12] bg-white/[0.14] px-2.5 py-1 font-semibold shadow-sm backdrop-blur" style={{ color: 'var(--brand-primary-foreground)', opacity: 0.86 }}>
                    <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                    </svg>
                    {paymentModeHint}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              {cartItemCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setMobileStep('cart')}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/20 bg-white/[0.18] px-3 text-[11px] font-bold shadow-sm backdrop-blur transition hover:bg-white/[0.26] active:scale-[0.97] sm:h-10 lg:hidden"
                  style={{ color: 'var(--brand-primary-foreground)' }}
                  aria-label={`View cart, ${cartUnitCount} item${cartUnitCount !== 1 ? 's' : ''}`}
                >
                  <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                  </svg>
                  <span className="font-black">{cartUnitCount}</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleShareStore}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.12] shadow-sm backdrop-blur transition hover:bg-white/25 sm:h-10 sm:w-10"
                aria-label="Share store link"
                title="Share"
                style={{ color: 'var(--brand-primary-foreground)' }}
              >
                <ShareIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          {storefront.stores.length > 1 ? (
            <div className="mt-4 rounded-2xl bg-white/[0.12] px-3 py-3 sm:px-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--brand-primary-foreground)', opacity: 0.6 }}>
                Pick up from
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {storefront.stores.map((store) => {
                  const isSelected = store.id === selectedStoreId;
                  return (
                    <button
                      key={store.id}
                      type="button"
                      onClick={() => handleStoreChange(store.id)}
                      className={isSelected
                        ? 'rounded-full bg-white px-4 py-2 text-xs font-semibold shadow-sm'
                        : 'rounded-full border border-white/25 bg-white/[0.15] px-4 py-2 text-xs font-semibold transition hover:bg-white/25'
                      }
                      style={isSelected
                        ? { color: 'var(--brand-primary)' }
                        : { color: 'var(--brand-primary-foreground)', opacity: 0.85 }
                      }
                    >
                      {store.name}
                    </button>
                  );
                })}
              </div>
              {cart.length > 0 && (
                <div className="mt-2 text-[10px]" style={{ color: 'var(--brand-primary-foreground)', opacity: 0.5 }}>
                  Switching store resets your cart.
                </div>
              )}
            </div>
          ) : null}
        </div>
      </header>

      {/* ── STORE DESCRIPTION STRIP ──────────────────────── */}
      {storefront.description ? (
        <div className="border-b border-black/5 bg-white">
          <div className="mx-auto max-w-screen-lg px-4 py-2.5 sm:px-6">
            <p className="line-clamp-2 text-sm leading-relaxed text-black/60">{storefront.description}</p>
          </div>
        </div>
      ) : null}

      {/* ── MAIN CONTENT ───────────────────────────────────── */}
      <div className={`mx-auto max-w-screen-lg px-4 sm:px-6 lg:pb-12 ${cartItemCount > 0 && mobileStep === 'browse' ? 'pb-[calc(9.5rem+env(safe-area-inset-bottom))]' : 'pb-[calc(3.5rem+env(safe-area-inset-bottom))]'}`}>
        <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-8 lg:pt-8">

          {/* ── LEFT: search + chips + product grid ──────── */}
          <section id={CATALOG_SECTION_ID} className="min-w-0">
            {/* Sticky search + category chips */}
            <div className="sticky top-0 z-20 -mx-4 border-b border-black/5 bg-white/95 px-4 pb-3 pt-3 shadow-[0_10px_30px_rgba(15,23,42,0.04)] backdrop-blur-sm sm:-mx-6 sm:px-6 lg:relative lg:top-auto lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:pt-0 lg:shadow-none lg:backdrop-blur-none">
              <form
                role="search"
                aria-label="Product search"
                className="block"
                onSubmit={(e) => e.preventDefault()}
              >
                <label htmlFor="storefront-search" className="sr-only">
                  Search products
                </label>
                <div className="relative">
                  <svg className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                  </svg>
                  <input
                    id="storefront-search"
                    name="q"
                    type="search"
                    className="h-[52px] w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-20 text-[15px] font-medium text-ink shadow-none outline-none transition placeholder:text-black/35 focus:border-blue-200 focus:shadow-[0_10px_28px_rgba(15,23,42,0.06)] focus:ring-4 focus:ring-blue-100/70"
                    placeholder="Search products"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    inputMode="search"
                    autoComplete="off"
                  />
                  {searchQuery && (
                    <button type="button" aria-label="Clear search" className="absolute right-2 top-1/2 inline-flex h-9 -translate-y-1/2 items-center rounded-xl bg-slate-100 px-3 text-xs font-bold text-black/55 transition hover:bg-slate-200 hover:text-ink" onClick={() => handleSearch('')}>
                      Clear
                    </button>
                  )}
                </div>
              </form>

              {categories.length > 0 && (
                <div className="relative mt-3">
                  <div
                    role="tablist"
                    aria-label="Product categories"
                    className="-mx-1 flex max-w-full gap-2 overflow-x-auto overscroll-x-contain px-1 pb-1 pr-8 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                   <button
                     type="button"
                     role="tab"
                     aria-selected={selectedCategoryId === ALL_CATEGORIES}
                     aria-label="Show all categories"
                    onClick={() => handleCategoryChange(ALL_CATEGORIES)}
                    className={selectedCategoryId === ALL_CATEGORIES
                      ? 'h-9 shrink-0 rounded-full px-4 text-xs font-bold text-white shadow-sm ring-2 ring-blue-100'
                      : 'h-9 shrink-0 rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-black/60 shadow-sm transition hover:border-blue-200 hover:text-ink'
                    }
                    style={selectedCategoryId === ALL_CATEGORIES ? primaryStyle : undefined}
                  >
                    All
                  </button>
                  {categories.map((category) => {
                    const active = category.id === selectedCategoryId;
                    return (
                       <button
                         key={category.id}
                         type="button"
                         role="tab"
                         aria-selected={active}
                         aria-label={`Filter by ${toTitleCase(category.name)} (${category.count} products)`}
                        onClick={() => handleCategoryChange(category.id)}
                        className={active
                          ? 'h-9 shrink-0 rounded-full px-4 text-xs font-bold text-white shadow-sm ring-2 ring-blue-100'
                          : 'h-9 shrink-0 rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-black/60 shadow-sm transition hover:border-blue-200 hover:text-ink'
                        }
                        style={active ? primaryStyle : undefined}
                      >
                        <span className="inline-block max-w-[9.5rem] truncate align-bottom">{toTitleCase(category.name)}</span>
                        <span className="ml-1.5 opacity-60" aria-hidden="true">{category.count}</span>
                      </button>
                    );
                  })}
                  </div>
                  <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white via-white/90 to-transparent lg:from-slate-50 lg:via-slate-50/90" aria-hidden="true" />
                </div>
              )}

              <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-black/45">
                <span>
                {filteredProducts.length === 0
                  ? searchQuery.trim()
                    ? `No results for "${searchQuery.trim()}"`
                    : selectedCategory
                      ? `No products in ${toTitleCase(selectedCategory.name)} right now`
                      : 'No products right now'
                  : `${filteredProducts.length} ${filteredProducts.length === 1 ? 'product' : 'products'}${selectedCategory ? ` in ${toTitleCase(selectedCategory.name)}` : ''}${searchQuery.trim() ? ` · "${searchQuery.trim()}"` : ''}`
                }
                </span>
                {cartItemCount > 0 ? (
                  <span className="font-semibold text-ink">{cartUnitCount} item{cartUnitCount !== 1 ? 's' : ''} in cart</span>
                ) : null}
              </div>
            </div>

            {!searchQuery.trim() && selectedCategoryId === ALL_CATEGORIES && featuredProducts.length > 0 ? (
              <section className="mt-4 rounded-3xl border border-black/5 bg-white p-3 shadow-sm">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-extrabold text-ink">Popular in this shop</h2>
                    <p className="text-xs text-black/45">Fast picks customers are likely to need today.</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                    Curated picks
                  </span>
                </div>
                <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {featuredProducts.map((product, featuredIndex) => {
                    const firstUnit = product.units[0];
                    const price = formatMoney(
                      firstUnit?.sellingPricePence ?? product.sellingPriceBasePence * (firstUnit?.conversionToBase ?? 1),
                      storefront.currency,
                    );
                    return (
                      <div key={product.id} className="min-w-[138px] overflow-hidden rounded-2xl border border-black/5 bg-slate-50">
                        <button
                          type="button"
                          className="relative block h-24 w-full overflow-hidden bg-white"
                          onClick={() => {
                            rememberViewedProduct(product.id);
                            trackEvent('product_view', product.id, { source: 'featured' });
                            scrollToProduct(product.id);
                          }}
                          aria-label={`View ${toTitleCase(product.name)}`}
                        >
                          <ProductImage src={product.imageUrl} fallbackSrc={product.categoryImageUrl} alt={toTitleCase(product.name)} inStock={product.onHandBase > 0} categoryName={product.publicCategoryName} priority={featuredIndex < 4} />
                        </button>
                        <div className="p-2">
                          <div className="line-clamp-2 min-h-[2rem] text-xs font-bold leading-tight text-ink">{toTitleCase(product.name)}</div>
                          <div className="mt-1 text-sm font-extrabold text-ink">{price}</div>
                          {cartProductIds.has(product.id) ? (
                            <button
                              type="button"
                              className="mt-2 h-10 w-full rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-black text-emerald-700"
                              onClick={() => scrollToProduct(product.id)}
                            >
                              In cart
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="mt-2 h-10 w-full rounded-xl text-xs font-black text-white shadow-sm"
                              style={primaryStyle}
                              onClick={() => addToCart(product.id)}
                            >
                              Add
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {catalogError ? (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <div>{catalogError}</div>
                <button
                  type="button"
                  onClick={() => void loadCatalog({ query: debouncedSearchQuery, categoryId: selectedCategoryId })}
                  className="mt-2 inline-flex h-9 items-center justify-center rounded-full border border-amber-300 bg-white/80 px-3.5 text-xs font-semibold text-amber-900 transition hover:bg-white"
                >
                  Try again
                </button>
              </div>
            ) : null}

            {/* Product grid or empty state */}
            {filteredProducts.length === 0 ? (
              showInitialEmptySkeleton ? (
                <div className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3 lg:gap-4">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <ProductCardSkeleton key={index} />
                  ))}
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-dashed border-black/10 bg-white px-6 py-16 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-black/30">
                    {searchQuery ? (
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                      </svg>
                    ) : (
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                      </svg>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-ink">
                    {searchQuery
                      ? `No products matched "${searchQuery}"`
                      : selectedCategory
                        ? 'No products found in this category'
                        : 'No products available right now'}
                  </div>
                  <div className="mt-1 text-xs text-black/50">
                    {searchQuery || selectedCategoryId !== ALL_CATEGORIES
                      ? 'Try browsing all products or choose another category.'
                      : 'Check back soon — this store is getting ready.'}
                  </div>
                  {(searchQuery || selectedCategoryId !== ALL_CATEGORIES) && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          handleSearch('');
                          handleCategoryChange(ALL_CATEGORIES);
                          scrollCatalogToTop();
                        }}
                        className="mt-3 text-xs font-semibold text-accent hover:underline"
                      >
                        Browse all products
                      </button>
                      {categorySuggestions.length > 0 ? (
                        <div className="mt-4">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/35">
                            Try
                          </div>
                          <div className="mt-2 flex flex-wrap justify-center gap-2">
                            {categorySuggestions.map((category) => (
                              <button
                                key={category.id}
                                type="button"
                                onClick={() => {
                                  handleSearch('');
                                  handleCategoryChange(category.id);
                                  scrollCatalogToTop();
                                }}
                                className="rounded-full border border-black/10 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-black/65 transition hover:border-black/20 hover:bg-white hover:text-ink"
                              >
                                {toTitleCase(category.name)}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              )
            ) : (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
                  {pagedProducts.map((product, index) => {
                    const selected = selectionState[product.id];
                    const selectedUnit = selected ? getUnitFromProduct(product, selected.unitId) : undefined;
                    const unitPrice = selectedUnit
                      ? formatMoney(
                          selectedUnit.sellingPricePence ?? product.sellingPriceBasePence * selectedUnit.conversionToBase,
                          storefront.currency,
                        )
                      : formatMoney(product.sellingPriceBasePence, storefront.currency);
                    const inStock = product.onHandBase > 0;
                    const hasPromo = product.promoBuyQty > 0 && product.promoGetQty > 0;
                    const displayName = toTitleCase(product.name);
                    const displayCategory = product.publicCategoryName ? toTitleCase(product.publicCategoryName) : null;
                    const productInCart = cartProductIds.has(product.id);
                    const productCartQty = cartQtyByProductId[product.id] ?? 0;

                    return (
                      <article
                        key={product.id}
                        id={`product-${product.id}`}
                        className={`group flex min-h-[22rem] flex-col overflow-hidden rounded-2xl border bg-white ${
                          inStock ? 'border-slate-200/60 shadow-[0_2px_12px_rgba(15,23,42,0.06),0_1px_3px_rgba(15,23,42,0.04)] transition hover:-translate-y-px hover:border-blue-100/80 hover:shadow-[0_8px_28px_rgba(15,23,42,0.10)]' : 'border-slate-200/40 opacity-60'
                        }`}
                      >
                        <button
                          type="button"
                          className="relative m-2 mb-0 h-32 overflow-hidden rounded-xl border border-slate-100 bg-gradient-to-b from-white to-slate-50/80 text-left lg:h-36"
                          onClick={() => { rememberViewedProduct(product.id); trackEvent('product_view', product.id); setDetailProduct(product); }}
                          aria-label={`View details for ${displayName}`}
                        >
                          <ProductImage src={product.imageUrl} fallbackSrc={product.categoryImageUrl} alt={displayName} inStock={inStock} categoryName={displayCategory} priority={index < 6} />
                          {hasPromo && inStock ? (
                            <div
                              className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white shadow-sm"
                              style={primaryStyle}
                            >
                              Promo
                            </div>
                          ) : null}
                          {!inStock ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/75 backdrop-blur-[1px]">
                              <span className="rounded-full bg-slate-900 px-3 py-1.5 text-[10px] font-bold text-white shadow-sm">
                                Sold out
                              </span>
                            </div>
                          ) : null}
                          {inStock && cartProductIds.has(product.id) ? (
                            <div className="absolute right-2 top-2 flex items-center gap-0.5 rounded-full bg-ink/90 px-2 py-0.5 text-[9px] font-bold text-white shadow backdrop-blur-sm">
                              <svg className="h-2.5 w-2.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                              </svg>
                              {cartQtyByProductId[product.id] ?? ''}
                            </div>
                          ) : null}
                        </button>

                  {/* Card body */}
                  <div className="flex flex-1 flex-col p-3">
                    {displayCategory && (
                      <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-black/35">
                        {displayCategory}
                      </div>
                    )}
                    <h2 className="mt-0.5 line-clamp-2 min-h-[2.25rem] text-[13px] font-bold leading-snug text-ink sm:text-sm">
                      {displayName}
                    </h2>

                    <div className="mt-auto pt-2.5">
                      <div className="space-y-1">
                        <div className="min-w-0">
                          <div className="text-lg font-black leading-none text-ink sm:text-xl">{unitPrice}</div>
                          {inStock ? (
                            <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Available for pickup
                            </div>
                          ) : (
                            <div className="text-[10px] font-semibold text-slate-500">Currently sold out</div>
                          )}
                        </div>
                      </div>

                      {product.units.length > 1 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {product.units.map((unit) => {
                            const isSelectedUnit = selected?.unitId === unit.id;
                            return (
                              <button
                                key={unit.id}
                                type="button"
                                disabled={!inStock || productInCart}
                                onClick={() =>
                                  setSelectionState((prev) => ({
                                    ...prev,
                                    [product.id]: {
                                      ...(prev[product.id] ?? { qtyInUnit: 1 }),
                                      unitId: unit.id,
                                    },
                                  }))
                                }
                                className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                  isSelectedUnit
                                    ? 'border-transparent text-white shadow-sm'
                                    : 'border-slate-200 bg-slate-50 text-black/55 hover:border-slate-300 hover:bg-white'
                                }`}
                                style={isSelectedUnit ? { backgroundColor: 'var(--store-primary)', color: 'var(--store-primary-foreground)' } : undefined}
                              >
                                {toTitleCase(unit.name)}
                              </button>
                            );
                          })}
                        </div>
                      ) : product.units[0] ? (
                        <div className="mt-1 text-[10px] font-semibold text-black/35">{toTitleCase(product.units[0].name)}</div>
                      ) : null}

                      {inStock && !productInCart ? (
                        <div className="mt-2.5 space-y-2">
                          <div className="flex h-[42px] w-full items-center justify-between overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-inner">
                            <button
                              type="button"
                              aria-label={`Decrease quantity of ${displayName}`}
                              className="flex h-[42px] w-[42px] items-center justify-center border-r border-slate-200 text-base font-bold text-black/50 transition hover:bg-white hover:text-accent disabled:bg-slate-100 disabled:text-black/20"
                              disabled={(selected?.qtyInUnit ?? 1) <= 1}
                              onClick={() =>
                                setSelectionState((prev) => ({
                                  ...prev,
                                  [product.id]: {
                                    ...(prev[product.id] ?? { unitId: product.units[0]?.id ?? '' }),
                                    qtyInUnit: Math.max(1, (prev[product.id]?.qtyInUnit ?? 1) - 1),
                                  },
                                }))
                              }
                            >
                              −
                            </button>
                            {qtyEditingProductId === product.id ? (
                              <input
                                type="number"
                                className="min-w-0 flex-1 bg-transparent text-center text-sm font-black text-ink focus:outline-none"
                                value={selected?.qtyInUnit ?? 1}
                                min={1}
                                max={MAX_CART_QTY}
                                // eslint-disable-next-line jsx-a11y/no-autofocus
                                autoFocus
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10);
                                  if (!isNaN(val) && val >= 1 && val <= MAX_CART_QTY) {
                                    setSelectionState((prev) => ({
                                      ...prev,
                                      [product.id]: {
                                        ...(prev[product.id] ?? { unitId: product.units[0]?.id ?? '' }),
                                        qtyInUnit: val,
                                      },
                                    }));
                                  }
                                }}
                                onBlur={() => setQtyEditingProductId(null)}
                                onKeyDown={(e) => { if (e.key === 'Enter') setQtyEditingProductId(null); }}
                              />
                            ) : (
                              <button
                                type="button"
                                className="min-w-0 flex-1 text-center text-sm font-black text-ink"
                                aria-label="Tap to edit quantity"
                                title="Tap to type a quantity"
                                onClick={() => setQtyEditingProductId(product.id)}
                              >
                                {selected?.qtyInUnit ?? 1}
                              </button>
                            )}
                            <button
                              type="button"
                              aria-label={`Increase quantity of ${displayName}`}
                              className="flex h-[42px] w-[42px] items-center justify-center border-l border-slate-200 text-base font-bold text-black/50 transition hover:bg-white hover:text-accent disabled:opacity-30"
                              disabled={(selected?.qtyInUnit ?? 1) >= MAX_CART_QTY}
                              onClick={() =>
                                setSelectionState((prev) => ({
                                  ...prev,
                                  [product.id]: {
                                    ...(prev[product.id] ?? { unitId: product.units[0]?.id ?? '' }),
                                    qtyInUnit: Math.min((prev[product.id]?.qtyInUnit ?? 1) + 1, MAX_CART_QTY),
                                  },
                                }))
                              }
                            >
                              +
                            </button>
                          </div>
                          <button
                            type="button"
                            className="flex h-11 w-full items-center justify-center rounded-xl bg-[linear-gradient(170deg,var(--store-primary),#0a3580)] text-sm font-black text-white shadow-[0_4px_14px_rgba(8,47,110,0.22)] transition hover:brightness-110 active:translate-y-px active:scale-[0.99]"
                            onClick={() => addToCart(product.id)}
                            aria-label={`Add ${displayName} to cart`}
                          >
                            Add to cart
                          </button>
                        </div>
                      ) : null}
                      {inStock && productInCart ? (
                        <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-1.5">
                          <div className="px-1 pb-1 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">
                            In cart
                          </div>
                          <div className="flex h-11 items-center overflow-hidden rounded-lg bg-white shadow-sm">
                            <button
                              type="button"
                              aria-label={`Remove one ${displayName} from cart`}
                              className="flex h-11 w-11 items-center justify-center text-base font-bold text-emerald-800 transition hover:bg-emerald-50"
                              onClick={() => adjustCartProduct(product.id, -1)}
                            >
                              -
                            </button>
                            <span className="min-w-0 flex-1 text-center text-sm font-black text-ink">
                              {productCartQty}
                            </span>
                            <button
                              type="button"
                              aria-label={`Add one more ${displayName} to cart`}
                              className="flex h-11 w-11 items-center justify-center text-base font-bold text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-30"
                              disabled={productCartQty >= MAX_CART_QTY}
                              onClick={() => adjustCartProduct(product.id, 1)}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
                    );
                  })}
                </div>

                {hasMoreProducts && (
                  <div ref={loadMoreSentinelRef} className="mt-6 flex flex-col items-center gap-2 py-2">
                    {catalogLoading ? (
                      <div className="flex items-center gap-2 text-sm text-black/40">
                        <SpinnerIcon className="h-4 w-4 animate-spin" />
                        Loading more…
                      </div>
                    ) : null}
                    <span className="text-[11px] text-black/35">
                      Showing {catalogProducts.length} of {catalogTotal}
                    </span>
                  </div>
                )}

                {showRecentlyViewed ? (
                  <section className="mt-8">
                    <div className="mb-3">
                      <h2 className="text-sm font-semibold text-ink">Recently viewed</h2>
                      <p className="text-xs text-black/45">Jump back to products you explored earlier.</p>
                    </div>

                    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
                      {recentlyViewedProducts.map((product) => {
                        const firstUnit = product.units[0];
                        const price = formatMoney(
                          firstUnit?.sellingPricePence ?? product.sellingPriceBasePence * (firstUnit?.conversionToBase ?? 1),
                          storefront.currency,
                        );

                        return (
                          <div
                            key={product.id}
                            className="group flex min-w-[220px] items-center gap-3 rounded-2xl border border-black/5 bg-white p-2.5 shadow-sm"
                          >
                            <button
                              type="button"
                              onClick={() => scrollToProduct(product.id)}
                              className="flex min-w-0 flex-1 items-center gap-3 text-left"
                            >
                              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-50">
                                <ProductImage src={product.imageUrl} fallbackSrc={product.categoryImageUrl} alt={toTitleCase(product.name)} inStock={product.onHandBase > 0} categoryName={product.publicCategoryName} />
                              </div>
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-ink">{toTitleCase(product.name)}</div>
                                <div className="text-xs text-black/45">{price}</div>
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => addToCart(product.id)}
                              className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 active:scale-[0.97]"
                              style={primaryStyle}
                            >
                              + Add
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ) : null}
              </>
            )}

            <footer className="mt-6 flex flex-col items-center gap-2 border-t border-black/5 pb-3 pt-5 text-center">
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-medium text-black/45">
                <span>Secure checkout</span>
                <span className="text-black/20" aria-hidden="true">·</span>
                <span>Pickup only</span>
                <span className="text-black/20" aria-hidden="true">·</span>
                <span>GH₵ pricing</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <p className="text-[11px] font-semibold text-black/38">Powered by TillFlow</p>
                <p className="text-[11px] text-black/28">Secure pickup ordering for local businesses.</p>
              </div>
            </footer>
          </section>

          {/* ── RIGHT: Desktop cart + checkout sidebar ───── */}
          <aside className="hidden lg:block lg:sticky lg:top-6 lg:self-start">
            {/* Cart section */}
            <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accentSoft text-accent">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-ink">Your cart</h2>
                    {cartDetails.length > 0 ? (
                      <div className="text-[11px] text-black/45">{cartUnitCount} item{cartUnitCount !== 1 ? 's' : ''} ready for pickup</div>
                    ) : null}
                  </div>
                </div>
                {cartItemCount > 0 ? (
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={primaryStyle}>
                    {cartItemCount}
                  </span>
                ) : (
                  <span className="text-xs text-black/40">Empty</span>
                )}
              </div>

              {cartDetails.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-black/10 bg-slate-50 px-4 py-8 text-center">
                  <div className="text-sm font-medium text-ink">Cart is empty</div>
                  <div className="mt-1 text-xs text-black/50">Tap "Add" on a product to get started.</div>
                  <button
                    type="button"
                    onClick={scrollCatalogToTop}
                    className="mt-4 inline-flex h-10 items-center justify-center rounded-xl border border-black/10 bg-white px-4 text-sm font-semibold text-ink transition hover:border-black/20 hover:bg-slate-50"
                  >
                    Browse products
                  </button>
                </div>
              ) : (
                <div className="mt-4 space-y-2.5">
                  {cartDetails.map((line) => (
                    <div key={line.id} className="rounded-2xl border border-black/5 bg-slate-50 px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                          <ProductImage src={line.product.imageUrl} fallbackSrc={line.product.categoryImageUrl} alt={toTitleCase(line.product.name)} inStock categoryName={line.product.publicCategoryName ?? line.product.categoryName} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-ink">{toTitleCase(line.product.name)}</div>
                          <div className="mt-0.5 text-xs text-black/50">{line.qtyInUnit} × {toTitleCase(line.unit.name)}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-semibold text-ink">{formatMoney(line.total, storefront.currency)}</div>
                          <button
                            type="button"
                            aria-label="Remove item"
                            className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-black/30 transition hover:bg-rose-50 hover:text-rose-600 active:bg-rose-100"
                            onClick={() => setCart((prev) => prev.filter((c) => c.id !== line.id))}
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {suggestedProducts.length > 0 ? (
                <div className="mt-4 border-t border-black/5 pt-4">
                  <div className="mb-3">
                    <h3 className="text-sm font-semibold text-ink">{recommendationState.label}</h3>
                    {recommendationState.description ? (
                      <p className="text-xs text-black/45">{recommendationState.description}</p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    {suggestedProducts.map((product) => {
                      const firstUnit = product.units[0];
                      const price = formatMoney(
                        firstUnit?.sellingPricePence ?? product.sellingPriceBasePence * (firstUnit?.conversionToBase ?? 1),
                        storefront.currency,
                      );

                      return (
                        <div key={product.id} className="flex items-center gap-3 rounded-xl bg-black/[0.03] px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => scrollToProduct(product.id)}
                            className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-slate-50"
                          >
                            <ProductImage src={product.imageUrl} fallbackSrc={product.categoryImageUrl} alt={toTitleCase(product.name)} inStock={product.onHandBase > 0} categoryName={product.publicCategoryName} />
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-ink">{toTitleCase(product.name)}</div>
                            <div className="text-xs text-black/45">{price}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => addToCart(product.id)}
                            className="rounded-full px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 active:scale-[0.97]"
                            style={primaryStyle}
                          >
                            + Add
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {cartDetails.length > 0 && (
                <div className="mt-4 space-y-1.5 border-t border-black/5 pt-3 text-sm">
                  <div className="flex items-center justify-between text-black/55">
                    <span>Subtotal</span>
                    <span>{formatMoney(totals.netSubtotal, storefront.currency)}</span>
                  </div>
                  {totals.vat > 0 ? (
                    <div className="flex items-center justify-between text-black/55">
                      <span>VAT</span>
                      <span>{formatMoney(totals.vat, storefront.currency)}</span>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between border-t border-black/5 pt-2 font-bold text-ink">
                    <span>Total</span>
                    <span className="text-lg">{formatMoney(orderTotal, storefront.currency)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Checkout section */}
            <div className="mt-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-ink">Checkout</h2>
                  <p className="mt-0.5 text-xs text-black/45">A quick pickup order. No password needed.</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">
                  Secure
                </span>
              </div>
              <div className="mt-4 space-y-4">
                {!paymentReady && cart.length > 0 ? <CheckoutUnavailableBanner /> : null}
                {storefront.pickupInstructions ? (
                  <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-900">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-sky-700">Pickup instructions</div>
                    {storefront.pickupInstructions}
                  </div>
                ) : null}
                <div>
                  <label htmlFor="checkout-name-desktop" className="block text-sm font-medium text-black/70">Full name</label>
                  <input id="checkout-name-desktop" name="name" className="input mt-1.5" placeholder="e.g. Ama Mensah" value={customerName} onChange={(e) => setCustomerName(e.target.value)} autoComplete="name" required />
                </div>
                <div>
                  <label htmlFor="checkout-phone-desktop" className="block text-xs font-semibold text-black/60">
                    {storefront.paymentConfig.mode === 'MOMO_NUMBER' || storefront.paymentConfig.mode === 'MERCHANT_SHORTCODE'
                      ? 'Mobile number (MoMo / WhatsApp)'
                      : 'Contact number'}
                  </label>
                  <input
                    id="checkout-phone-desktop"
                    name="phone"
                    className="input mt-1.5"
                    placeholder="024 123 4567 or +233 24 123 4567"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    required
                    aria-describedby="checkout-phone-desktop-hint"
                  />
                  <p id="checkout-phone-desktop-hint" className="mt-1 text-[11px] text-black/45">
                    {storefront.paymentConfig.mode === 'MOMO_NUMBER' || storefront.paymentConfig.mode === 'MERCHANT_SHORTCODE'
                      ? 'Use the Ghana number you receive MoMo or WhatsApp updates on.'
                      : 'Your Ghana phone number for order updates.'}
                  </p>
                </div>
                {storefront.paymentConfig.mode === 'MOMO_NUMBER' ? (
                  <div>
                    <label htmlFor="checkout-network-desktop" className="block text-sm font-medium text-black/70">MoMo network</label>
                    <select id="checkout-network-desktop" name="network" className="input mt-1.5" value={network} onChange={(e) => setNetwork(e.target.value as 'MTN' | 'TELECEL' | 'AIRTELTIGO')}>
                      <option value="MTN">MTN</option>
                      <option value="TELECEL">Telecel</option>
                      <option value="AIRTELTIGO">AirtelTigo</option>
                    </select>
                  </div>
                ) : null}
                <div>
                  <label htmlFor="checkout-email-desktop" className="block text-sm font-medium text-black/70">Email <span className="text-black/35 font-normal">(optional)</span></label>
                  <input id="checkout-email-desktop" name="email" className="input mt-1.5" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="checkout-notes-desktop" className="block text-sm font-medium text-black/70">Pickup note <span className="text-black/35 font-normal">(optional)</span></label>
                  <textarea id="checkout-notes-desktop" name="notes" className="input mt-1.5 min-h-[80px]" placeholder="Anything the store should know" value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} />
                </div>
                <PaymentPreviewCard
                  paymentConfig={storefront.paymentConfig}
                  currency={storefront.currency}
                  paymentDetails={paymentDetails}
                />
                {paymentReady && !checkoutReady && cart.length > 0 ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">
                    Add your name and phone number so the store can confirm pickup.
                  </div>
                ) : null}
                {error ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">{error}</div>
                ) : null}
                <button
                  type="button"
                  className="w-full rounded-2xl px-4 py-4 text-base font-bold text-white shadow-sm transition hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-black/15 disabled:text-white/70 disabled:shadow-none"
                  style={checkoutReady ? primaryStyle : undefined}
                  disabled={submitting || !checkoutReady}
                  onClick={submitCheckout}
                >
                  {!paymentReady
                    ? 'Checkout temporarily unavailable'
                    : submitting
                      ? <span className="inline-flex items-center justify-center gap-2"><SpinnerIcon className="h-4 w-4 animate-spin" />Placing order…</span>
                      : cartUnitCount > 0
                        ? `Place order (${cartUnitCount} item${cartUnitCount === 1 ? '' : 's'})`
                        : 'Place order'}
                </button>
                <div className="text-center text-[11px] text-black/40">
                  After placing your order, you&apos;ll receive payment instructions and a unique reference code.
                </div>
              </div>
            </div>
          </aside>

        </div>
      </div>

      {/* ── MOBILE CART PANEL ──────────────────────────────── */}
      <div
        className={`fixed inset-x-0 top-0 z-50 flex h-[100dvh] flex-col bg-white transition-transform duration-300 ease-in-out lg:hidden ${
          mobileStep === 'cart' ? 'translate-y-0' : 'translate-y-full pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3 border-b border-black/5 bg-white px-4 py-3.5">
          <button
            type="button"
            onClick={() => setMobileStep('browse')}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-black/60 hover:text-ink"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back
          </button>
          <div className="flex-1 text-center">
            <h2 className="font-semibold text-ink">Your cart</h2>
            {cartDetails.length > 0 ? <div className="text-[10px] text-black/40">{cartUnitCount} item{cartUnitCount !== 1 ? 's' : ''}</div> : null}
          </div>
          {cartItemCount > 0 ? (
            <span className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={primaryStyle}>
              {cartItemCount}
            </span>
          ) : <span className="w-8" />}
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {!paymentReady && cart.length > 0 ? <CheckoutUnavailableBanner /> : null}
          {cartDetails.length === 0 ? (
            <div className={`text-center ${!paymentReady && cart.length > 0 ? 'pt-6 pb-12' : 'py-12'}`}>
              <div className="text-sm font-medium text-ink">Cart is empty</div>
              <div className="mt-1 text-xs text-black/50">Add products to continue.</div>
              <button
                type="button"
                onClick={handleBrowseProducts}
                className="mt-4 inline-flex h-10 items-center justify-center rounded-xl border border-black/10 bg-white px-4 text-sm font-semibold text-ink transition hover:border-black/20 hover:bg-slate-50"
              >
                Browse products
              </button>
            </div>
          ) : (
            <div className={`space-y-2.5 ${!paymentReady ? 'mt-4' : ''}`}>
              {cartDetails.map((line) => (
                <div key={line.id} className="rounded-2xl border border-black/5 bg-slate-50 px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                      <ProductImage src={line.product.imageUrl} fallbackSrc={line.product.categoryImageUrl} alt={toTitleCase(line.product.name)} inStock categoryName={line.product.publicCategoryName ?? line.product.categoryName} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">{toTitleCase(line.product.name)}</div>
                      <div className="text-xs text-black/45">{toTitleCase(line.unit.name)}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold text-ink">{formatMoney(line.total, storefront.currency)}</div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex h-9 items-center overflow-hidden rounded-lg border border-black/10 bg-white">
                      <button
                        type="button"
                        aria-label={`Remove one ${toTitleCase(line.product.name)} from cart`}
                        className="flex h-9 w-9 items-center justify-center text-sm font-bold text-black/50 transition hover:bg-slate-50 hover:text-rose-600"
                        onClick={() => adjustCartProduct(line.productId, -1)}
                      >
                        −
                      </button>
                      <span className="min-w-[2rem] text-center text-sm font-black text-ink">{line.qtyInUnit}</span>
                      <button
                        type="button"
                        aria-label={`Add one more ${toTitleCase(line.product.name)} to cart`}
                        className="flex h-9 w-9 items-center justify-center text-sm font-bold text-black/50 transition hover:bg-slate-50 hover:text-accent disabled:opacity-30"
                        disabled={line.qtyInUnit >= MAX_CART_QTY}
                        onClick={() => adjustCartProduct(line.productId, 1)}
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${toTitleCase(line.product.name)} from cart`}
                      className="text-[11px] font-medium text-black/35 transition hover:text-rose-600"
                      onClick={() => setCart((prev) => prev.filter((c) => c.id !== line.id))}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {suggestedProducts.length > 0 ? (
            <div className="mt-5 rounded-2xl border border-black/5 bg-white p-3">
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-ink">{recommendationState.label}</h3>
                {recommendationState.description ? (
                  <p className="text-xs text-black/45">{recommendationState.description}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                {suggestedProducts.map((product) => {
                  const firstUnit = product.units[0];
                  const price = formatMoney(
                    firstUnit?.sellingPricePence ?? product.sellingPriceBasePence * (firstUnit?.conversionToBase ?? 1),
                    storefront.currency,
                  );

                  return (
                    <div key={product.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => scrollToProduct(product.id)}
                        className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-50"
                      >
                        <ProductImage src={product.imageUrl} fallbackSrc={product.categoryImageUrl} alt={toTitleCase(product.name)} inStock={product.onHandBase > 0} categoryName={product.publicCategoryName} />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-ink">{toTitleCase(product.name)}</div>
                        <div className="text-xs text-black/45">{price}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => addToCart(product.id)}
                        className="rounded-full px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
                        style={primaryStyle}
                      >
                        + Add
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {cartDetails.length > 0 && (
            <div className="mt-5 space-y-1.5 rounded-2xl border border-black/5 bg-white px-4 py-3 text-sm">
              <div className="flex items-center justify-between text-black/55">
                <span>Subtotal</span>
                <span>{formatMoney(totals.netSubtotal, storefront.currency)}</span>
              </div>
              {totals.vat > 0 ? (
                <div className="flex items-center justify-between text-black/55">
                  <span>VAT</span>
                  <span>{formatMoney(totals.vat, storefront.currency)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between border-t border-black/5 pt-3 text-base font-bold text-ink">
                <span>Total</span>
                <span>{formatMoney(orderTotal, storefront.currency)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-black/5 bg-white px-4 pt-4 keyboard-safe-bottom pb-[env(safe-area-inset-bottom)]">
          <button
            type="button"
            className="w-full rounded-2xl px-4 py-4 text-base font-bold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-black/15 disabled:text-white/70"
            style={cart.length > 0 && paymentReady ? primaryStyle : undefined}
            disabled={cart.length === 0 || !paymentReady}
            onClick={() => {
              if (!paymentReady) return;
              setMobileStep('checkout');
            }}
          >
            {paymentReady
              ? `Proceed to checkout — ${formatMoney(orderTotal, storefront.currency)}`
              : 'Checkout temporarily unavailable'}
          </button>
        </div>
      </div>

      {/* ── MOBILE CHECKOUT PANEL ──────────────────────────── */}
        <div
          className={`fixed inset-x-0 top-0 z-50 flex h-[var(--visual-viewport-height)] flex-col overflow-hidden bg-white transition-transform duration-300 ease-in-out lg:hidden ${
            mobileStep === 'checkout' ? 'translate-y-0' : 'translate-y-full pointer-events-none'
          }`}
        >
        <div className="flex items-center gap-3 border-b border-black/5 bg-white px-4 py-3.5">
          <button
            type="button"
            onClick={() => setMobileStep('cart')}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-black/60 hover:text-ink"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Cart
          </button>
          <div className="flex-1 text-center">
            <h2 className="font-semibold text-ink">Checkout</h2>
            <div className="text-[10px] text-black/40">Pickup order</div>
          </div>
          <span className="text-sm font-bold text-ink">{formatMoney(orderTotal, storefront.currency)}</span>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 keyboard-safe-bottom">
          {!paymentReady && cart.length > 0 ? (
            <div className="mb-4">
              <CheckoutUnavailableBanner />
            </div>
          ) : null}
          {storefront.pickupInstructions ? (
            <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-sky-700">Pickup instructions</div>
              {storefront.pickupInstructions}
            </div>
          ) : null}
          <div className="mb-4">
            <div className="mb-3 overflow-hidden rounded-2xl border border-black/5 bg-white">
              <div className="border-b border-black/5 bg-black/[0.02] px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black/45">Order summary</div>
              </div>
              <div className="divide-y divide-black/5 text-sm">
                {cartDetails.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 truncate text-ink">{item.product.name}</span>
                    <span className="shrink-0 text-xs text-black/50">{item.qtyInUnit} × {formatMoney(item.unitPrice, storefront.currency)}</span>
                    <span className="shrink-0 font-semibold text-ink">{formatMoney(item.total, storefront.currency)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between border-t border-black/5 px-3 py-2 text-sm font-bold text-ink">
                <span>Total</span>
                <span>{formatMoney(orderTotal, storefront.currency)}</span>
              </div>
            </div>
            <PaymentPreviewCard
              paymentConfig={storefront.paymentConfig}
              currency={storefront.currency}
              paymentDetails={paymentDetails}
            />
          </div>

          <div className="rounded-2xl border border-black/5 bg-white p-4">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-ink">Your details</h3>
              <p className="mt-0.5 text-xs text-black/45">Used only to confirm payment and pickup.</p>
            </div>
            <div className="space-y-4">
            <div>
              <label htmlFor="checkout-name-mobile" className="block text-sm font-medium text-black/70">Full name</label>
              <input id="checkout-name-mobile" name="name" className="input mt-1" placeholder="Full name" autoComplete="name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="checkout-phone-mobile" className="block text-xs font-semibold text-black/60">
                {storefront.paymentConfig.mode === 'MOMO_NUMBER' || storefront.paymentConfig.mode === 'MERCHANT_SHORTCODE'
                  ? 'Mobile number (MoMo / WhatsApp)'
                  : 'Contact number'}
              </label>
              <input
                id="checkout-phone-mobile"
                name="phone"
                className="input mt-1"
                placeholder="024 123 4567 or +233 24 123 4567"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                required
                aria-describedby="checkout-phone-mobile-hint"
              />
              <p id="checkout-phone-mobile-hint" className="mt-1 text-[10px] text-black/45">
                {storefront.paymentConfig.mode === 'MOMO_NUMBER' || storefront.paymentConfig.mode === 'MERCHANT_SHORTCODE'
                  ? 'Use the Ghana number you receive MoMo or WhatsApp updates on.'
                  : 'Your Ghana phone number for order updates.'}
              </p>
            </div>
            {storefront.paymentConfig.mode === 'MOMO_NUMBER' ? (
              <div>
                <label htmlFor="checkout-network-mobile" className="block text-sm font-medium text-black/70">MoMo network</label>
                <select id="checkout-network-mobile" name="network" className="input mt-1" value={network} onChange={(e) => setNetwork(e.target.value as 'MTN' | 'TELECEL' | 'AIRTELTIGO')}>
                  <option value="MTN">MTN</option>
                  <option value="TELECEL">Telecel</option>
                  <option value="AIRTELTIGO">AirtelTigo</option>
                </select>
              </div>
            ) : null}
            <div>
              <label htmlFor="checkout-email-mobile" className="block text-sm font-medium text-black/70">Email <span className="text-black/35 font-normal">(optional)</span></label>
              <input id="checkout-email-mobile" name="email" className="input mt-1" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
            </div>
            <div>
              <label htmlFor="checkout-notes-mobile" className="block text-sm font-medium text-black/70">Pickup note <span className="text-black/35 font-normal">(optional)</span></label>
              <textarea id="checkout-notes-mobile" name="notes" className="input mt-1 min-h-[80px]" placeholder="Anything the store should know" value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} />
            </div>
            {paymentReady && !checkoutReady && cart.length > 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                Name and phone number are required before placing the order.
              </div>
            ) : null}
            {error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
            ) : null}
            </div>
          </div>
        </div>

        <div className="border-t border-black/5 bg-white px-4 pt-4 keyboard-safe-bottom pb-[env(safe-area-inset-bottom)]">
          <button
            type="button"
            className="w-full rounded-2xl px-4 py-4 text-base font-bold text-white shadow-md transition hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-black/15 disabled:text-white/70 disabled:shadow-none"
            style={checkoutReady ? primaryStyle : undefined}
            disabled={submitting || !checkoutReady}
            onClick={submitCheckout}
          >
            {!paymentReady
              ? 'Checkout temporarily unavailable'
              : submitting
                ? <span className="inline-flex items-center justify-center gap-2"><SpinnerIcon className="h-4 w-4 animate-spin" />Placing order…</span>
                : cartUnitCount > 0
                  ? `Place order (${cartUnitCount} item${cartUnitCount === 1 ? '' : 's'})`
                  : 'Place order'}
          </button>
          <div className="mt-3 text-center text-[11px] text-black/40">
            After placing your order, you&apos;ll receive payment instructions and a unique reference code.
          </div>
        </div>
      </div>

      {/* ── PRODUCT DETAIL SHEET ───────────────────────────── */}
      {detailProduct ? (
        <ProductDetailSheet
          product={detailProduct}
          storefront={storefront}
          onClose={() => setDetailProduct(null)}
          onAddToCart={addToCart}
          selectionState={selectionState}
          setSelectionState={setSelectionState}
          cartProductIds={cartProductIds}
          cartQtyByProductId={cartQtyByProductId}
          adjustCartProduct={adjustCartProduct}
          primaryStyle={primaryStyle}
        />
      ) : null}

      {/* ── SHARE TOAST ────────────────────────────────────── */}
      {shareToast ? (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex justify-center px-4">
          <div className="pointer-events-auto rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white shadow-lg">
            {shareToast}
          </div>
        </div>
      ) : null}

      {/* ── FLOATING CART BAR (mobile browse) ──────────────── */}
      {cartItemCount > 0 && mobileStep === 'browse' ? (
        <div
          className="animate-fade-in-up pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4 lg:hidden keyboard-safe-fixed-bottom hide-when-keyboard-open"
        >
          <button
            type="button"
            className="pointer-events-auto inline-flex min-h-16 w-full max-w-sm items-center justify-between gap-3 rounded-2xl border border-white/15 bg-[linear-gradient(175deg,var(--store-primary),#082f6e)] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_42px_rgba(6,14,44,0.28),0_4px_10px_rgba(6,14,44,0.14)] transition active:translate-y-px active:scale-[0.99]"
            onClick={() => setMobileStep('cart')}
          >
            <span className="min-w-0">
              <span className="block truncate font-black">
                {cartUnitCount} item{cartUnitCount === 1 ? '' : 's'} · {formatMoney(orderTotal, storefront.currency)}
              </span>
            </span>
            <span className="shrink-0 rounded-xl bg-white px-3.5 py-2 text-xs font-black shadow-sm" style={{ color: 'var(--store-primary)' }}>
              View cart
            </span>
          </button>
        </div>
      ) : null}
    </main>
  );
}
