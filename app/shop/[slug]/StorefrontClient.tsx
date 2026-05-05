'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatMoney, toTitleCase, formatGhanaPhoneForDisplay } from '@/lib/format';
import { buildCartDetails, buildProductMap, formatAvailable, getUnitFromProduct, sumCartTotals, type PosCartLine } from '@/lib/payments/pos-cart';
import { resolveBrandStyles } from '@/lib/storefront-branding';
import { getPaymentInstructionDetails } from '@/lib/storefront-payments';
import type { PublicStorefront } from '@/lib/services/online-orders';

const ALL_CATEGORIES = '__all__';
const CATALOG_PAGE_SIZE = 48;

type CatalogResponse = {
  products: PublicStorefront['products'];
  total: number;
  offset: number;
  limit: number;
};

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
  alt,
  inStock,
  categoryName,
}: {
  src: string | null;
  alt: string;
  inStock: boolean;
  categoryName?: string | null;
}) {
  const [failed, setFailed] = useState(false);
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

  if (!src || failed) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 ${inStock ? '' : 'opacity-60'}`}>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-black/5 bg-white/80 shadow-sm">
          <span className="text-sm font-black tracking-[0.12em]" style={{ color: 'var(--store-primary)', opacity: 0.62 }}>{fallbackLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      className={`object-cover transition-transform duration-300 ${inStock ? 'group-hover:scale-[1.03]' : 'grayscale'}`}
      onError={() => setFailed(true)}
      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
    />
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
}: {
  paymentConfig: import('@/lib/storefront-payments').StorefrontPaymentConfig;
  currency: string;
}) {
  void currency;
  const details = getPaymentInstructionDetails(paymentConfig);
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
  const CART_STORAGE_KEY = `tillflow_cart_${storefront.slug}`;
  const RECENTLY_VIEWED_STORAGE_KEY = `tillflow_viewed_${storefront.slug}`;
  const [cart, setCart] = useState<PosCartLine[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(`tillflow_cart_${storefront.slug}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as PosCartLine[];
      const productIds = new Set(storefront.products.map((product) => product.id));
      return parsed.filter((line) => productIds.has(line.productId));
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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(ALL_CATEGORIES);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [mobileStep, setMobileStep] = useState<'browse' | 'cart' | 'checkout'>('browse');
  const [isMounted, setIsMounted] = useState(false);
  const [recentlyViewed, setRecentlyViewed] = useState<string[]>([]);
  const [storefrontSessionId, setStorefrontSessionId] = useState('');

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
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
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

  useEffect(() => {
    const controller = new AbortController();
    const query = searchQuery.trim();
    const params = new URLSearchParams({
      slug: storefront.slug,
      offset: '0',
      limit: String(CATALOG_PAGE_SIZE),
    });
    if (query) params.set('q', query);
    if (selectedCategoryId !== ALL_CATEGORIES) params.set('category', selectedCategoryId);

    setCatalogLoading(true);
    setCatalogError(null);
    fetch(`/api/storefront/catalog?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load products.');
        return response.json() as Promise<CatalogResponse>;
      })
      .then((payload) => {
        setCatalogProducts(payload.products);
        setCatalogTotal(payload.total);
      })
      .catch((loadError) => {
        if (loadError?.name === 'AbortError') return;
        setCatalogError('Products could not refresh. Check your connection and try again.');
      })
      .finally(() => setCatalogLoading(false));

    return () => controller.abort();
  }, [searchQuery, selectedCategoryId, storefront.slug]);

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
    const message = `Shop at ${storefront.name} — browse and pay with MoMo: ${shareUrl}`;

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
        return Boolean(key && cartCategoryKeys.has(key) && !cartProductIds.has(product.id));
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
      .filter((product) => !cartProductIds.has(product.id))
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

  async function submitCheckout() {
    setSubmitting(true);
    setError(null);

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

      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? 'Unable to start checkout right now.');
        return;
      }

      router.push(payload.redirectPath);
      try {
        localStorage.removeItem(CART_STORAGE_KEY);
      } catch {}
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Unable to start checkout right now.');
    } finally {
      setSubmitting(false);
    }
  }

  const storefrontTitle = storefront.headline || storefront.name;
  const storefrontInitials = (storefront.name || 'TF')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('') || 'TF';
  const cartItemCount = cartDetails.length;
  const cartUnitCount = cart.reduce((sum, line) => sum + line.qtyInUnit, 0);
  const checkoutReady = cart.length > 0 && customerName.trim().length > 0 && customerPhone.trim().length > 0;
  const brandStyles = resolveBrandStyles(storefront.branding);
  const primaryStyle: React.CSSProperties = {
    backgroundColor: 'var(--store-primary)',
    color: 'var(--store-primary-foreground)',
  };
  const heroStyle: React.CSSProperties = {
    backgroundColor: 'var(--store-primary)',
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
    <div
      className="min-h-screen bg-slate-50"
      style={brandStyles.cssVars as React.CSSProperties}
    >
      {/* ── STORE HERO ─────────────────────────────────────── */}
      <header className="relative overflow-hidden pt-[env(safe-area-inset-top)]" style={heroStyle}>
        <div className="relative z-10 mx-auto max-w-screen-lg px-4 py-4 sm:px-6 sm:py-6">
          <div className="flex items-start gap-3 sm:gap-4">
            {storefront.branding.logoUrl ? (
              <Image
                src={storefront.branding.logoUrl}
                alt={storefront.name}
                width={80}
                height={80}
                className="h-14 w-14 shrink-0 rounded-2xl object-cover bg-white/20 ring-1 ring-white/30 shadow-lg sm:h-16 sm:w-16"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30 shadow-lg text-lg font-bold sm:h-16 sm:w-16 sm:text-xl" style={{ color: 'var(--brand-primary-foreground)' }}>
                {storefrontInitials}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="mb-1 inline-flex items-center rounded-full bg-white/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--brand-primary-foreground)', opacity: 0.82 }}>
                TillFlow online store
              </div>
              <h1 className="break-words hyphens-auto text-lg font-bold leading-tight sm:text-2xl lg:text-3xl" style={{ color: 'var(--brand-primary-foreground)' }}>
                {storefrontTitle}
              </h1>
              {storefront.branding.tagline && (
                <p className="mt-0.5 line-clamp-2 text-xs sm:text-sm" style={{ color: 'var(--brand-primary-foreground)', opacity: 0.76 }}>
                  {storefront.branding.tagline}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] sm:text-xs">
                {storefront.openStatus ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 font-semibold" style={{ color: 'var(--brand-primary-foreground)' }}>
                    <span className={`h-1.5 w-1.5 rounded-full ${storefront.openStatus.isOpen ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    {storefront.openStatus.shortLabel}
                    {storefront.openStatus.detail ? ` · ${storefront.openStatus.detail}` : ''}
                  </span>
                ) : null}
                {(selectedStore?.phone ?? storefront.phone) ? (
                  <a
                    href={`tel:${selectedStore?.phone ?? storefront.phone ?? ''}`}
                    className="inline-flex min-h-9 items-center gap-1 rounded-full bg-white/12 px-2.5 py-1 transition hover:bg-white/20"
                    style={{ color: 'var(--brand-primary-foreground)', opacity: 0.9 }}
                  >
                    <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.272.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                    </svg>
                    {formatGhanaPhoneForDisplay(selectedStore?.phone ?? storefront.phone ?? '')}
                  </a>
                ) : null}
                {(selectedStore?.address ?? storefront.address) ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/12 px-2.5 py-1" style={{ color: 'var(--brand-primary-foreground)', opacity: 0.85 }}>
                    <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                    </svg>
                    {selectedStore?.address ?? storefront.address}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1 rounded-full bg-white/12 px-2.5 py-1" style={{ color: 'var(--brand-primary-foreground)', opacity: 0.75 }}>
                  <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Pickup available
                </span>
                {paymentModeHint ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/12 px-2.5 py-1" style={{ color: 'var(--brand-primary-foreground)', opacity: 0.75 }}>
                    <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                    </svg>
                    {paymentModeHint}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1.5">
              {customer ? (
                <a
                  href={`/shop/${storefront.slug}/account`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/15 px-3 text-xs font-semibold transition hover:bg-white/25"
                  style={{ color: 'var(--brand-primary-foreground)' }}
                >
                  <span className="max-w-[8rem] truncate">
                    {customer.name?.split(' ')[0] ?? 'Account'}
                  </span>
                </a>
              ) : (
                <a
                  href={`/shop/${storefront.slug}/login`}
                  className="inline-flex h-9 items-center rounded-full bg-white/15 px-3 text-xs font-semibold transition hover:bg-white/25"
                  style={{ color: 'var(--brand-primary-foreground)' }}
                >
                  Sign in
                </a>
              )}
              <button
                type="button"
                onClick={handleShareStore}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25"
                aria-label="Share store link"
                style={{ color: 'var(--brand-primary-foreground)' }}
              >
                <ShareIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          {storefront.stores.length > 1 ? (
            <div className="mt-4 rounded-2xl bg-white/12 px-3 py-3 sm:px-4">
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
                        : 'rounded-full border border-white/25 bg-white/15 px-4 py-2 text-xs font-semibold transition hover:bg-white/25'
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
      <div className="mx-auto max-w-screen-lg px-4 pb-32 sm:px-6 lg:pb-12">
        <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-8 lg:pt-8">

          {/* ── LEFT: search + chips + product grid ──────── */}
          <section className="min-w-0">
            {/* Sticky search + category chips */}
            <div className="sticky top-0 z-20 -mx-4 border-b border-black/5 bg-white/95 px-4 pb-3 pt-3 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:relative lg:top-auto lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:pt-0 lg:backdrop-blur-none">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                  </svg>
                  <input
                    className="input h-11 rounded-2xl border-black/8 bg-white pl-9 shadow-sm"
                    placeholder="Search products…"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    inputMode="search"
                  />
                </div>
                {searchQuery && (
                  <button type="button" className="rounded-full px-2 text-sm font-semibold text-black/50 hover:bg-black/5 hover:text-ink" onClick={() => handleSearch('')}>
                    Clear
                  </button>
                )}
              </div>

              {categories.length > 0 && (
                <div className="-mx-1 mt-3 flex max-w-full gap-2 overflow-x-auto overscroll-x-contain px-1 pb-1 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <button
                    type="button"
                    onClick={() => handleCategoryChange(ALL_CATEGORIES)}
                    className={selectedCategoryId === ALL_CATEGORIES
                      ? 'shrink-0 rounded-full px-3.5 py-2 text-xs font-bold text-white shadow-sm'
                      : 'shrink-0 rounded-full border border-black/10 bg-white px-3.5 py-2 text-xs font-semibold text-black/60 transition hover:border-black/20 hover:text-ink'
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
                        onClick={() => handleCategoryChange(category.id)}
                        className={active
                          ? 'shrink-0 rounded-full px-3.5 py-2 text-xs font-bold text-white shadow-sm'
                          : 'shrink-0 rounded-full border border-black/10 bg-white px-3.5 py-2 text-xs font-semibold text-black/60 transition hover:border-black/20 hover:text-ink'
                        }
                        style={active ? primaryStyle : undefined}
                      >
                        {toTitleCase(category.name)}
                        <span className="ml-1.5 opacity-60">{category.count}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-black/45">
                <span>
                {filteredProducts.length === 0
                  ? (selectedCategory ? `No products found in ${toTitleCase(selectedCategory.name)}` : 'No products found right now')
                  : `${filteredProducts.length} ${filteredProducts.length === 1 ? 'product' : 'products'}${selectedCategory ? ` in ${toTitleCase(selectedCategory.name)}` : ''}`
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
                  <span className="shrink-0 rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-black/45">
                    {catalogTotal} live items
                  </span>
                </div>
                <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {featuredProducts.map((product) => {
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
                          <ProductImage src={product.imageUrl} alt={toTitleCase(product.name)} inStock={product.onHandBase > 0} categoryName={product.publicCategoryName} />
                        </button>
                        <div className="p-2">
                          <div className="line-clamp-2 min-h-[2rem] text-xs font-bold leading-tight text-ink">{toTitleCase(product.name)}</div>
                          <div className="mt-1 text-sm font-extrabold text-ink">{price}</div>
                          <button
                            type="button"
                            className="mt-2 h-10 w-full rounded-xl text-xs font-black text-white shadow-sm"
                            style={primaryStyle}
                            onClick={() => addToCart(product.id)}
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {catalogError ? (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {catalogError}
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
                    <button
                      type="button"
                      onClick={() => { handleSearch(''); handleCategoryChange(ALL_CATEGORIES); }}
                      className="mt-3 text-xs font-semibold text-accent hover:underline"
                    >
                      Browse all products
                    </button>
                  )}
                </div>
              )
            ) : (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
                  {pagedProducts.map((product) => {
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

                    return (
                      <article
                        key={product.id}
                        id={`product-${product.id}`}
                        className={`group flex min-h-[17.5rem] flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 ${
                          inStock ? 'shadow-[0_6px_20px_rgba(15,23,42,0.045)] transition hover:-translate-y-0.5 hover:shadow-md hover:ring-black/10' : 'opacity-60 shadow-none'
                        }`}
                      >
                        <button
                          type="button"
                          className="relative h-28 w-full overflow-hidden bg-slate-100 text-left sm:h-32 lg:h-36"
                          onClick={() => rememberViewedProduct(product.id)}
                          aria-label={`View ${displayName}`}
                        >
                          <ProductImage src={product.imageUrl} alt={displayName} inStock={inStock} categoryName={displayCategory} />
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
                              <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold text-white shadow-sm">
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
                        <div className="flex flex-1 flex-col p-2.5 sm:p-3">
                          {displayCategory && (
                            <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-black/35 sm:text-[9px]">
                              {displayCategory}
                            </div>
                          )}
                          <h2 className="mt-0.5 line-clamp-2 text-xs font-semibold leading-snug text-ink sm:text-sm">
                            {displayName}
                          </h2>

                          <div className="mt-auto pt-2">
                            <div className="flex items-end justify-between gap-2">
                              <div className="text-lg font-black leading-none text-ink sm:text-xl">{unitPrice}</div>
                              {inStock ? <span className="text-[9px] font-medium text-emerald-600">Available</span> : null}
                            </div>

                            {product.units.length > 1 ? (
                              <select
                                className="mt-2 w-full rounded-xl border border-black/10 bg-slate-50 px-2 py-2 text-[11px] font-medium text-black/65 focus:outline-none focus:ring-1 focus:ring-accent/30 sm:text-xs"
                                value={selected?.unitId ?? ''}
                                disabled={!inStock}
                                onChange={(event) =>
                                  setSelectionState((prev) => ({
                                    ...prev,
                                    [product.id]: {
                                      ...(prev[product.id] ?? { qtyInUnit: 1 }),
                                      unitId: event.target.value,
                                    },
                                  }))
                                }
                              >
                                {product.units.map((unit) => (
                                  <option key={unit.id} value={unit.id}>
                                    {toTitleCase(unit.name)}
                                  </option>
                                ))}
                              </select>
                            ) : product.units[0] ? (
                              <div className="mt-1 text-[10px] font-medium text-black/40">{toTitleCase(product.units[0].name)}</div>
                            ) : null}

                            {inStock ? (
                                <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-1.5">
                                  <div className="flex h-11 items-center overflow-hidden rounded-xl border border-black/10 bg-slate-50">
                                    <button
                                      type="button"
                                      aria-label="Decrease quantity"
                                      className="flex h-11 w-11 items-center justify-center text-sm text-black/50 transition hover:bg-white hover:text-accent disabled:opacity-30"
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
                                    <span className="w-9 text-center text-xs font-bold text-ink">
                                      {selected?.qtyInUnit ?? 1}
                                    </span>
                                    <button
                                      type="button"
                                      aria-label="Increase quantity"
                                      className="flex h-11 w-11 items-center justify-center text-sm text-black/50 transition hover:bg-white hover:text-accent"
                                    onClick={() =>
                                      setSelectionState((prev) => ({
                                        ...prev,
                                        [product.id]: {
                                          ...(prev[product.id] ?? { unitId: product.units[0]?.id ?? '' }),
                                          qtyInUnit: (prev[product.id]?.qtyInUnit ?? 1) + 1,
                                        },
                                      }))
                                    }
                                  >
                                    +
                                  </button>
                                </div>
                                    <button
                                      type="button"
                                      className="flex h-11 flex-1 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm transition active:scale-[0.97] hover:opacity-90"
                                  style={primaryStyle}
                                  onClick={() => addToCart(product.id)}
                                >
                                  Add
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {hasMoreProducts && (
                  <div className="mt-6 flex flex-col items-center gap-2">
                    <button
                      type="button"
                      className="rounded-2xl border border-black/10 bg-white px-6 py-3 text-sm font-semibold text-ink shadow-sm transition hover:border-black/20 hover:shadow-md active:scale-[0.98]"
                      onClick={loadMoreProducts}
                      disabled={catalogLoading}
                    >
                      {catalogLoading ? 'Loading products...' : 'Load more products'}
                    </button>
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
                                <ProductImage src={product.imageUrl} alt={toTitleCase(product.name)} inStock={product.onHandBase > 0} categoryName={product.publicCategoryName} />
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

            <footer className="mt-10 flex flex-col items-center gap-2 border-t border-black/5 pt-6 text-center">
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-black/40">
                <span>Secure mobile-money checkout</span>
                <span className="text-black/20">·</span>
                <span>Pickup only</span>
                <span className="text-black/20">·</span>
                <span>Powered by TillFlow</span>
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
                </div>
              ) : (
                <div className="mt-4 space-y-2.5">
                  {cartDetails.map((line) => (
                    <div key={line.id} className="rounded-2xl border border-black/5 bg-slate-50 px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                          <ProductImage src={line.product.imageUrl} alt={toTitleCase(line.product.name)} inStock categoryName={line.product.publicCategoryName ?? line.product.categoryName} />
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
                            <ProductImage src={product.imageUrl} alt={toTitleCase(product.name)} inStock={product.onHandBase > 0} categoryName={product.publicCategoryName} />
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
                {storefront.pickupInstructions ? (
                  <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-900">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-sky-700">Pickup instructions</div>
                    {storefront.pickupInstructions}
                  </div>
                ) : null}
                <div>
                  <label className="block text-sm font-medium text-black/70">Full name</label>
                  <input className="input mt-1.5" placeholder="e.g. Ama Mensah" value={customerName} onChange={(e) => setCustomerName(e.target.value)} autoComplete="name" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-black/60">Mobile number (MoMo / WhatsApp)</label>
                  <input
                    className="input mt-1.5"
                    placeholder="024 123 4567 or +233 24 123 4567"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                  />
                  <p className="mt-1 text-[11px] text-black/45">Use the Ghana number you receive MoMo or WhatsApp updates on.</p>
                </div>
                {storefront.paymentConfig.mode === 'MOMO_NUMBER' ? (
                  <div>
                    <label className="block text-sm font-medium text-black/70">MoMo network</label>
                    <select className="input mt-1.5" value={network} onChange={(e) => setNetwork(e.target.value as 'MTN' | 'TELECEL' | 'AIRTELTIGO')}>
                      <option value="MTN">MTN</option>
                      <option value="TELECEL">Telecel</option>
                      <option value="AIRTELTIGO">AirtelTigo</option>
                    </select>
                  </div>
                ) : null}
                <div>
                  <label className="block text-sm font-medium text-black/70">Email <span className="text-black/35 font-normal">(optional)</span></label>
                  <input className="input mt-1.5" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-black/70">Pickup note <span className="text-black/35 font-normal">(optional)</span></label>
                  <textarea className="input mt-1.5 min-h-[80px]" placeholder="Anything the store should know" value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} />
                </div>
                <PaymentPreviewCard paymentConfig={storefront.paymentConfig} currency={storefront.currency} />
                {!checkoutReady && cart.length > 0 ? (
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
                  style={cart.length > 0 ? primaryStyle : undefined}
                  disabled={submitting || !checkoutReady}
                  onClick={submitCheckout}
                >
                  {submitting ? 'Placing order…' : cartUnitCount > 0 ? `Place order (${cartUnitCount} item${cartUnitCount === 1 ? '' : 's'})` : 'Place order'}
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
          {cartDetails.length === 0 ? (
            <div className="py-12 text-center">
              <div className="text-sm font-medium text-ink">Cart is empty</div>
              <div className="mt-1 text-xs text-black/50">Add products to continue.</div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {cartDetails.map((line) => (
                <div key={line.id} className="rounded-2xl border border-black/5 bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                      <ProductImage src={line.product.imageUrl} alt={toTitleCase(line.product.name)} inStock categoryName={line.product.publicCategoryName ?? line.product.categoryName} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-ink">{toTitleCase(line.product.name)}</div>
                      <div className="mt-0.5 text-xs text-black/50">{line.qtyInUnit} × {toTitleCase(line.unit.name)}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-semibold text-ink">{formatMoney(line.total, storefront.currency)}</div>
                      <button
                        type="button"
                        aria-label="Remove item"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-black/30 transition hover:bg-rose-50 hover:text-rose-600 active:bg-rose-100"
                        onClick={() => setCart((prev) => prev.filter((c) => c.id !== line.id))}
                      >
                        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
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
                        <ProductImage src={product.imageUrl} alt={toTitleCase(product.name)} inStock={product.onHandBase > 0} categoryName={product.publicCategoryName} />
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
            style={cart.length > 0 ? primaryStyle : undefined}
            disabled={cart.length === 0}
            onClick={() => setMobileStep('checkout')}
          >
            Proceed to checkout — {formatMoney(orderTotal, storefront.currency)}
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
            <PaymentPreviewCard paymentConfig={storefront.paymentConfig} currency={storefront.currency} />
          </div>

          <div className="rounded-2xl border border-black/5 bg-white p-4">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-ink">Your details</h3>
              <p className="mt-0.5 text-xs text-black/45">Used only to confirm payment and pickup.</p>
            </div>
            <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-black/70">Full name</label>
              <input className="input mt-1" placeholder="Full name" autoComplete="name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-black/60">Mobile number (MoMo / WhatsApp)</label>
              <input
                className="input mt-1"
                placeholder="024 123 4567 or +233 24 123 4567"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
              <p className="mt-1 text-[10px] text-black/45">Use the Ghana number you receive MoMo or WhatsApp updates on.</p>
            </div>
            {storefront.paymentConfig.mode === 'MOMO_NUMBER' ? (
              <div>
                <label className="block text-sm font-medium text-black/70">MoMo network</label>
                <select className="input mt-1" value={network} onChange={(e) => setNetwork(e.target.value as 'MTN' | 'TELECEL' | 'AIRTELTIGO')}>
                  <option value="MTN">MTN</option>
                  <option value="TELECEL">Telecel</option>
                  <option value="AIRTELTIGO">AirtelTigo</option>
                </select>
              </div>
            ) : null}
            <div>
              <label className="block text-sm font-medium text-black/70">Email <span className="text-black/35 font-normal">(optional)</span></label>
              <input className="input mt-1" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-black/70">Pickup note <span className="text-black/35 font-normal">(optional)</span></label>
              <textarea className="input mt-1 min-h-[80px]" placeholder="Anything the store should know" value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} />
            </div>
            {!checkoutReady && cart.length > 0 ? (
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
            style={cart.length > 0 ? primaryStyle : undefined}
            disabled={submitting || !checkoutReady}
            onClick={submitCheckout}
          >
            {submitting ? 'Placing order…' : cartUnitCount > 0 ? `Place order (${cartUnitCount} item${cartUnitCount === 1 ? '' : 's'})` : 'Place order'}
          </button>
          <div className="mt-3 text-center text-[11px] text-black/40">
            After placing your order, you&apos;ll receive payment instructions and a unique reference code.
          </div>
        </div>
      </div>

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
          className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4 lg:hidden keyboard-safe-fixed-bottom hide-when-keyboard-open"
        >
          <button
            type="button"
            className="pointer-events-auto inline-flex w-full max-w-sm items-center justify-between gap-3 rounded-2xl px-5 py-3.5 text-sm font-semibold text-white shadow-2xl transition active:scale-[0.98]"
            style={primaryStyle}
            onClick={() => setMobileStep('cart')}
          >
            <span className="flex items-center gap-2.5">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/25 text-xs font-bold">
                {cartItemCount}
              </span>
              View cart
            </span>
            <span className="font-bold">{formatMoney(orderTotal, storefront.currency)}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
