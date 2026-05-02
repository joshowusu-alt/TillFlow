'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatMoney, toTitleCase, formatGhanaPhoneForDisplay } from '@/lib/format';
import { buildCartDetails, buildProductMap, formatAvailable, getUnitFromProduct, sumCartTotals, type PosCartLine } from '@/lib/payments/pos-cart';
import { resolveBrandStyles } from '@/lib/storefront-branding';
import type { PublicStorefront } from '@/lib/services/online-orders';

const ALL_CATEGORIES = '__all__';

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
}: {
  src: string | null;
  alt: string;
  inStock: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className={`flex h-full w-full items-center justify-center ${inStock ? 'text-accent/40' : 'text-black/20'}`}>
        <PackageIcon className="h-7 w-7" />
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

type ProductSelectionState = Record<string, { unitId: string; qtyInUnit: number }>;

function initialSelections(storefront: PublicStorefront) {
  return storefront.products.reduce<ProductSelectionState>((acc, product) => {
    acc[product.id] = {
      unitId: product.units[0]?.id ?? '',
      qtyInUnit: 1,
    };
    return acc;
  }, {});
}

const PRODUCTS_PER_PAGE = 12;

export default function StorefrontClient({ storefront }: { storefront: PublicStorefront }) {
  const router = useRouter();
  const CART_STORAGE_KEY = `tillflow_cart_${storefront.slug}`;
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
  const [selectionState, setSelectionState] = useState<ProductSelectionState>(() => initialSelections(storefront));
  const [selectedStoreId, setSelectedStoreId] = useState<string>(() => storefront.stores[0]?.id ?? '');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [network, setNetwork] = useState<'MTN' | 'TELECEL' | 'AIRTELTIGO'>('MTN');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(ALL_CATEGORIES);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [mobileStep, setMobileStep] = useState<'browse' | 'cart' | 'checkout'>('browse');

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {}
  }, [cart, CART_STORAGE_KEY]);

  const selectedStore = useMemo(
    () => storefront.stores.find((store) => store.id === selectedStoreId) ?? null,
    [storefront.stores, selectedStoreId],
  );

  const productsForStore = useMemo(
    () =>
      storefront.products.map((product) => ({
        ...product,
        onHandBase: selectedStoreId ? product.onHandByStore[selectedStoreId] ?? 0 : product.onHandBase,
      })),
    [storefront.products, selectedStoreId],
  );

  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const product of productsForStore) {
      if (product.categoryId && product.categoryName) {
        seen.set(product.categoryId, product.categoryName);
      }
    }
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [productsForStore]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId],
  );

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return productsForStore.filter((p) => {
      if (selectedCategoryId !== ALL_CATEGORIES && p.categoryId !== selectedCategoryId) {
        return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.categoryName?.toLowerCase() ?? '').includes(q)
      );
    });
  }, [productsForStore, searchQuery, selectedCategoryId]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedProducts = filteredProducts.slice(
    (safePage - 1) * PRODUCTS_PER_PAGE,
    safePage * PRODUCTS_PER_PAGE,
  );

  function handleSearch(value: string) {
    setSearchQuery(value);
    setCurrentPage(1);
  }

  function handleCategoryChange(nextId: string) {
    setSelectedCategoryId(nextId);
    setCurrentPage(1);
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

  function handleStoreChange(nextStoreId: string) {
    if (nextStoreId === selectedStoreId) return;
    setSelectedStoreId(nextStoreId);
    setCart([]);
    setError(null);
    setCurrentPage(1);
  }
  const totals = useMemo(() => sumCartTotals(cartDetails), [cartDetails]);
  const orderTotal = totals.netSubtotal + totals.vat;

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
  const brandStyles = resolveBrandStyles(storefront.branding);
  const primaryStyle: React.CSSProperties = {
    backgroundColor: 'var(--brand-primary)',
    color: 'var(--brand-primary-foreground)',
  };
  const heroStyle: React.CSSProperties = {
    backgroundColor: 'var(--brand-primary)',
    color: 'var(--brand-primary-foreground)',
  };

  return (
    <div
      className="min-h-screen bg-slate-50"
      style={brandStyles.cssVars as React.CSSProperties}
    >
      {/* ── STORE HERO ─────────────────────────────────────── */}
      <header className="relative overflow-hidden" style={heroStyle}>
        <div className="absolute inset-0 bg-black/15 pointer-events-none" />
        <div className="relative z-10 mx-auto max-w-screen-lg px-4 py-6 sm:px-6 sm:py-8">
          <div className="flex items-start gap-4">
            {storefront.branding.logoUrl ? (
              <Image
                src={storefront.branding.logoUrl}
                alt={storefront.name}
                width={80}
                height={80}
                className="h-16 w-16 shrink-0 rounded-full object-cover bg-white/20 ring-2 ring-white/30 shadow-lg sm:h-20 sm:w-20"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/20 ring-2 ring-white/30 shadow-lg text-xl font-bold sm:h-20 sm:w-20 sm:text-2xl" style={{ color: 'var(--brand-primary-foreground)' }}>
                {storefrontInitials}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold leading-tight sm:text-2xl lg:text-3xl" style={{ color: 'var(--brand-primary-foreground)' }}>
                {storefrontTitle}
              </h1>
              {storefront.branding.tagline && (
                <p className="mt-0.5 text-sm" style={{ color: 'var(--brand-primary-foreground)', opacity: 0.75 }}>
                  {storefront.branding.tagline}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                {storefront.openStatus ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 font-semibold" style={{ color: 'var(--brand-primary-foreground)' }}>
                    <span className={`h-1.5 w-1.5 rounded-full ${storefront.openStatus.isOpen ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    {storefront.openStatus.shortLabel}
                    {storefront.openStatus.detail ? ` · ${storefront.openStatus.detail}` : ''}
                  </span>
                ) : null}
                {(selectedStore?.phone ?? storefront.phone) ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/12 px-2.5 py-1" style={{ color: 'var(--brand-primary-foreground)', opacity: 0.85 }}>
                    <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.272.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                    </svg>
                    {formatGhanaPhoneForDisplay(selectedStore?.phone ?? storefront.phone ?? '')}
                  </span>
                ) : null}
                {(selectedStore?.address ?? storefront.address) ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/12 px-2.5 py-1" style={{ color: 'var(--brand-primary-foreground)', opacity: 0.85 }}>
                    <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S12 17.642 12 10.5a7.5 7.5 0 1115 0z" />
                    </svg>
                    {selectedStore?.address ?? storefront.address}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1 rounded-full bg-white/12 px-2.5 py-1" style={{ color: 'var(--brand-primary-foreground)', opacity: 0.75 }}>
                  <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Pickup only
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleShareStore}
              className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25"
              aria-label="Share store link"
              style={{ color: 'var(--brand-primary-foreground)' }}
            >
              <ShareIcon className="h-4 w-4" />
            </button>
          </div>

          {storefront.stores.length > 1 ? (
            <div className="mt-5 rounded-2xl bg-white/12 px-4 py-3">
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

      {/* ── MAIN CONTENT ───────────────────────────────────── */}
      <div className="mx-auto max-w-screen-lg px-4 pb-32 sm:px-6 lg:pb-12">
        <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-8 lg:pt-8">

          {/* ── LEFT: search + chips + product grid ──────── */}
          <section className="min-w-0">
            {/* Sticky search + category chips */}
            <div className="sticky top-0 z-20 -mx-4 border-b border-black/5 bg-white/95 px-4 pb-3 pt-3 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:relative lg:top-auto lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                  </svg>
                  <input
                    className="input pl-9"
                    placeholder="Search products…"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                  />
                </div>
                {searchQuery && (
                  <button type="button" className="text-sm font-medium text-black/50 hover:text-ink" onClick={() => handleSearch('')}>
                    Clear
                  </button>
                )}
              </div>

              {categories.length > 0 && (
                <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <button
                    type="button"
                    onClick={() => handleCategoryChange(ALL_CATEGORIES)}
                    className={selectedCategoryId === ALL_CATEGORIES
                      ? 'shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold text-white shadow-sm'
                      : 'shrink-0 rounded-full border border-black/10 bg-white px-4 py-1.5 text-xs font-semibold text-black/60 transition hover:border-black/20 hover:text-ink'
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
                          ? 'shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold text-white shadow-sm'
                          : 'shrink-0 rounded-full border border-black/10 bg-white px-4 py-1.5 text-xs font-semibold text-black/60 transition hover:border-black/20 hover:text-ink'
                        }
                        style={active ? primaryStyle : undefined}
                      >
                        {toTitleCase(category.name)}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-2 text-[11px] text-black/40">
                {filteredProducts.length === 0
                  ? (selectedCategory ? `No products in ${toTitleCase(selectedCategory.name)}` : 'No products to show')
                  : `${filteredProducts.length} ${filteredProducts.length === 1 ? 'product' : 'products'}${selectedCategory ? ` in ${toTitleCase(selectedCategory.name)}` : ''}`
                }
              </div>
            </div>

            {/* Product grid or empty state */}
            {filteredProducts.length === 0 ? (
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
                  {searchQuery ? `No results for "${searchQuery}"` : 'Nothing here yet'}
                </div>
                <div className="mt-1 text-xs text-black/50">
                  {searchQuery ? 'Try a different category or search term.' : 'Check back soon — this store is getting ready.'}
                </div>
                {searchQuery && (
                  <button type="button" onClick={() => handleSearch('')} className="mt-3 text-xs font-semibold text-accent hover:underline">
                    Clear search
                  </button>
                )}
              </div>
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
                    const displayCategory = product.categoryName ? toTitleCase(product.categoryName) : null;

                    return (
                      <article
                        key={product.id}
                        className={`group flex flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5 ${
                          inStock ? 'transition hover:shadow-md hover:ring-black/10' : 'opacity-60'
                        }`}
                      >
                        {/* Image area — compact 80px */}
                        <div className="relative h-20 w-full overflow-hidden bg-slate-50 sm:h-24 lg:h-28">
                          <ProductImage src={product.imageUrl} alt={displayName} inStock={inStock} />
                          {hasPromo && inStock ? (
                            <div
                              className="absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white"
                              style={primaryStyle}
                            >
                              Promo
                            </div>
                          ) : null}
                          {!inStock ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/65">
                              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600 shadow-sm">
                                Sold out
                              </span>
                            </div>
                          ) : null}
                        </div>

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
                            <div className="text-sm font-bold text-ink sm:text-base">{unitPrice}</div>

                            {product.units.length > 1 ? (
                              <select
                                className="mt-1 w-full rounded-lg border border-black/10 bg-white px-2 py-1 text-[10px] text-black/60 focus:outline-none focus:ring-1 focus:ring-accent/30 sm:text-xs"
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
                              <div className="mt-0.5 text-[10px] text-black/40">{toTitleCase(product.units[0].name)}</div>
                            ) : null}

                            {inStock ? (
                              <div className="mt-2 flex items-center gap-1.5">
                                <div className="flex items-center overflow-hidden rounded-lg border border-black/10">
                                  <button
                                    type="button"
                                    aria-label="Decrease quantity"
                                    className="flex h-8 w-7 items-center justify-center text-sm text-black/50 transition hover:text-accent disabled:opacity-30"
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
                                  <span className="w-7 text-center text-xs font-semibold text-ink">
                                    {selected?.qtyInUnit ?? 1}
                                  </span>
                                  <button
                                    type="button"
                                    aria-label="Increase quantity"
                                    className="flex h-8 w-7 items-center justify-center text-sm text-black/50 transition hover:text-accent"
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
                                  className="flex h-8 flex-1 items-center justify-center rounded-lg text-xs font-semibold text-white transition hover:opacity-90"
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

                {totalPages > 1 && (
                  <div className="mt-4 flex items-center justify-between rounded-2xl bg-white px-5 py-3 shadow-sm ring-1 ring-black/5">
                    <button
                      type="button"
                      className="btn-ghost text-sm disabled:opacity-40"
                      disabled={safePage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    >
                      ← Previous
                    </button>
                    <span className="text-sm text-black/55">
                      Page {safePage} of {totalPages}
                      <span className="ml-2 text-black/35">({filteredProducts.length})</span>
                    </span>
                    <button
                      type="button"
                      className="btn-ghost text-sm disabled:opacity-40"
                      disabled={safePage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next →
                    </button>
                  </div>
                )}
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
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accentSoft text-accent">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                    </svg>
                  </div>
                  <h2 className="text-base font-semibold text-ink">Your cart</h2>
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
                <div className="mt-4 rounded-xl border border-dashed border-black/10 bg-black/[0.02] px-4 py-8 text-center">
                  <div className="text-sm font-medium text-ink">Cart is empty</div>
                  <div className="mt-1 text-xs text-black/50">Tap "Add" on a product to get started.</div>
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  {cartDetails.map((line) => (
                    <div key={line.id} className="rounded-xl bg-black/[0.03] px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-ink">{toTitleCase(line.product.name)}</div>
                          <div className="mt-0.5 text-xs text-black/50">{line.qtyInUnit} × {toTitleCase(line.unit.name)}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-semibold text-ink">{formatMoney(line.total, storefront.currency)}</div>
                          <button
                            type="button"
                            className="mt-0.5 text-xs font-medium text-rose-600 hover:text-rose-700"
                            onClick={() => setCart((prev) => prev.filter((c) => c.id !== line.id))}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

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
            <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <h2 className="text-base font-semibold text-ink">Checkout</h2>
              <div className="mt-4 space-y-3">
                {storefront.pickupInstructions ? (
                  <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-900">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-sky-700">Pickup instructions</div>
                    {storefront.pickupInstructions}
                  </div>
                ) : null}
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-black/50">Your name</label>
                  <input className="input mt-1" placeholder="Full name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-black/50">Mobile money number</label>
                  <input className="input mt-1" placeholder="e.g. 024 123 4567" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-black/50">Network</label>
                  <select className="input mt-1" value={network} onChange={(e) => setNetwork(e.target.value as 'MTN' | 'TELECEL' | 'AIRTELTIGO')}>
                    <option value="MTN">MTN</option>
                    <option value="TELECEL">Telecel</option>
                    <option value="AIRTELTIGO">AirtelTigo</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-black/50">Email (optional)</label>
                  <input className="input mt-1" placeholder="you@example.com" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-black/50">Pickup note (optional)</label>
                  <textarea className="input mt-1 min-h-[80px]" placeholder="Anything the store should know" value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} />
                </div>
                {error ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">{error}</div>
                ) : null}
                <button
                  type="button"
                  className="w-full rounded-xl px-4 py-3.5 text-sm font-bold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-black/15 disabled:text-white/70 disabled:shadow-none"
                  style={cart.length > 0 ? primaryStyle : undefined}
                  disabled={submitting || cart.length === 0}
                  onClick={submitCheckout}
                >
                  {submitting ? 'Starting payment…' : cart.length === 0 ? 'Place Order' : `Place Order — ${formatMoney(orderTotal, storefront.currency)}`}
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
        className={`fixed inset-0 z-50 flex flex-col bg-white transition-transform duration-300 ease-in-out lg:hidden ${
          mobileStep === 'cart' ? 'translate-y-0' : 'translate-y-full pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3 border-b border-black/5 bg-white px-4 py-4">
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
          <h2 className="flex-1 text-center font-semibold text-ink">Your cart</h2>
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
            <div className="space-y-2">
              {cartDetails.map((line) => (
                <div key={line.id} className="rounded-xl bg-black/[0.03] px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-ink">{toTitleCase(line.product.name)}</div>
                      <div className="mt-0.5 text-xs text-black/50">{line.qtyInUnit} × {toTitleCase(line.unit.name)}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-semibold text-ink">{formatMoney(line.total, storefront.currency)}</div>
                      <button
                        type="button"
                        className="mt-0.5 text-xs font-medium text-rose-600 hover:text-rose-700"
                        onClick={() => setCart((prev) => prev.filter((c) => c.id !== line.id))}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {cartDetails.length > 0 && (
            <div className="mt-5 space-y-1.5 border-t border-black/5 pt-4 text-sm">
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

        <div className="border-t border-black/5 bg-white px-4 pb-10 pt-4">
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
        className={`fixed inset-0 z-50 flex flex-col bg-white transition-transform duration-300 ease-in-out lg:hidden ${
          mobileStep === 'checkout' ? 'translate-y-0' : 'translate-y-full pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3 border-b border-black/5 bg-white px-4 py-4">
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
          <h2 className="flex-1 text-center font-semibold text-ink">Checkout</h2>
          <span className="text-sm font-bold text-ink">{formatMoney(orderTotal, storefront.currency)}</span>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {storefront.pickupInstructions ? (
            <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-sky-700">Pickup instructions</div>
              {storefront.pickupInstructions}
            </div>
          ) : null}

          <div className="space-y-4">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-black/50">Your name</label>
              <input className="input mt-1" placeholder="Full name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-black/50">Mobile money number</label>
              <input className="input mt-1" placeholder="e.g. 024 123 4567" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-black/50">Network</label>
              <select className="input mt-1" value={network} onChange={(e) => setNetwork(e.target.value as 'MTN' | 'TELECEL' | 'AIRTELTIGO')}>
                <option value="MTN">MTN</option>
                <option value="TELECEL">Telecel</option>
                <option value="AIRTELTIGO">AirtelTigo</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-black/50">Email (optional)</label>
              <input className="input mt-1" placeholder="you@example.com" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-black/50">Pickup note (optional)</label>
              <textarea className="input mt-1 min-h-[80px]" placeholder="Anything the store should know" value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} />
            </div>
            {error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
            ) : null}
          </div>
        </div>

        <div className="border-t border-black/5 bg-white px-4 pb-10 pt-4">
          <button
            type="button"
            className="w-full rounded-2xl px-4 py-4 text-base font-bold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-black/15 disabled:text-white/70"
            style={cart.length > 0 ? primaryStyle : undefined}
            disabled={submitting || cart.length === 0}
            onClick={submitCheckout}
          >
            {submitting ? 'Starting payment…' : `Place Order — ${formatMoney(orderTotal, storefront.currency)}`}
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
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-5 lg:hidden">
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
