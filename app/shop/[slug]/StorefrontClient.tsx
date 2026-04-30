'use client';

import { useMemo, useState } from 'react';
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
  const [cart, setCart] = useState<PosCartLine[]>([]);
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
  const primaryStyle = brandStyles.hasPrimary
    ? {
        backgroundColor: 'var(--brand-primary)',
        color: 'var(--brand-primary-foreground)',
      }
    : undefined;
  const primaryTextStyle = brandStyles.hasPrimary
    ? { color: 'var(--brand-primary)' }
    : undefined;

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50"
      style={(brandStyles.hasPrimary || brandStyles.hasAccent) ? (brandStyles.cssVars as React.CSSProperties) : undefined}
    >
      <div className="mx-auto max-w-7xl px-4 py-8 pb-32 sm:px-6 lg:px-8 xl:pb-8">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-accentSoft/70 via-white to-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
          <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 h-48 w-48 rounded-full bg-blue-200/40 blur-3xl" />

          <div className="relative flex flex-col gap-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
              {storefront.branding.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={storefront.branding.logoUrl}
                  alt={storefront.name}
                  className="h-16 w-16 shrink-0 rounded-2xl object-contain bg-white p-1 shadow-lg ring-1 ring-black/5 sm:h-20 sm:w-20"
                />
              ) : (
                <div
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-xl font-bold shadow-lg sm:h-20 sm:w-20 sm:text-2xl"
                  style={primaryStyle ?? { background: 'linear-gradient(135deg, var(--color-accent), color-mix(in srgb, var(--color-accent) 80%, transparent))' }}
                >
                  <span style={primaryStyle ? undefined : { color: '#fff' }}>{storefrontInitials}</span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div
                      className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent"
                      style={primaryTextStyle}
                    >
                      TillFlow online store
                    </div>
                    <h1 className="mt-2 break-words text-3xl font-display font-bold capitalize tracking-tight text-ink sm:text-4xl">
                      {storefrontTitle.toLowerCase()}
                    </h1>
                    {storefront.branding.tagline && (
                      <p className="mt-1 text-sm font-medium text-black/55 italic">{storefront.branding.tagline}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleShareStore}
                    className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white text-black/65 shadow-sm transition hover:border-accent/30 hover:text-accent sm:h-11 sm:w-11"
                    aria-label="Share store link"
                    title="Share store link"
                  >
                    <ShareIcon className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-black/60 sm:text-base">
                  {storefront.description || 'Browse available products, build your cart, and pay with mobile money for pickup.'}
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-black/60">
                  {selectedStore?.phone ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-black/5 bg-white/80 px-3 py-1.5 shadow-sm">
                      <svg className="h-3.5 w-3.5 text-accent" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.272.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                      </svg>
                      {formatGhanaPhoneForDisplay(selectedStore.phone)}
                    </span>
                  ) : storefront.phone ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-black/5 bg-white/80 px-3 py-1.5 shadow-sm">
                      <svg className="h-3.5 w-3.5 text-accent" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.272.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                      </svg>
                      {formatGhanaPhoneForDisplay(storefront.phone)}
                    </span>
                  ) : null}
                  {storefront.openStatus ? (
                    <span
                      className={
                        storefront.openStatus.isOpen
                          ? 'inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-800 shadow-sm'
                          : 'inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-900 shadow-sm'
                      }
                    >
                      <span
                        className={
                          storefront.openStatus.isOpen
                            ? 'h-1.5 w-1.5 rounded-full bg-emerald-500'
                            : 'h-1.5 w-1.5 rounded-full bg-amber-500'
                        }
                      />
                      <span className="font-semibold">{storefront.openStatus.shortLabel}</span>
                      {storefront.openStatus.detail ? (
                        <span className="text-[11px] opacity-80">· {storefront.openStatus.detail}</span>
                      ) : null}
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-black/5 bg-white/80 px-3 py-1.5 shadow-sm">
                    <svg className="h-3.5 w-3.5 text-accent" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                    </svg>
                    Pickup only
                  </span>
                  {selectedStore?.address ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-black/5 bg-white/80 px-3 py-1.5 shadow-sm">
                      <svg className="h-3.5 w-3.5 text-accent" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25s-7.5-4.108-7.5-11.25a7.5 7.5 0 1115 0z" />
                      </svg>
                      {selectedStore.address}
                    </span>
                  ) : storefront.address ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-black/5 bg-white/80 px-3 py-1.5 shadow-sm">
                      <svg className="h-3.5 w-3.5 text-accent" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25s-7.5-4.108-7.5-11.25a7.5 7.5 0 1115 0z" />
                      </svg>
                      {storefront.address}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            {storefront.stores.length > 1 ? (
              <div className="rounded-2xl border border-black/5 bg-white/80 px-4 py-3 backdrop-blur-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-black/45">Pick up from</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {storefront.stores.map((store) => {
                    const isSelected = store.id === selectedStoreId;
                    return (
                      <button
                        key={store.id}
                        type="button"
                        onClick={() => handleStoreChange(store.id)}
                        className={
                          isSelected
                            ? 'min-h-11 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white shadow-sm'
                            : 'min-h-11 rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-black/65 transition hover:border-accent/30 hover:text-accent'
                        }
                      >
                        {store.name}
                      </button>
                    );
                  })}
                </div>
                {cart.length > 0 ? (
                  <div className="mt-2 text-[11px] text-black/45">Switching pickup store will reset your cart.</div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,2fr)_380px]">
          <section className="space-y-4">
            <div className="sticky top-0 z-30 -mx-4 space-y-3 bg-slate-50/95 px-4 pb-3 pt-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 xl:relative xl:top-auto xl:z-auto xl:mx-0 xl:bg-transparent xl:p-0 xl:backdrop-blur-none">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <svg
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                  </svg>
                  <input
                    className="input pl-9"
                    placeholder="Search products by name or category…"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                  />
                </div>
                {searchQuery && (
                  <button
                    type="button"
                    className="text-sm text-black/50 hover:text-ink"
                    onClick={() => handleSearch('')}
                  >
                    Clear
                  </button>
                )}
              </div>

              {categories.length > 0 ? (
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <button
                    type="button"
                    onClick={() => handleCategoryChange(ALL_CATEGORIES)}
                    className={
                      selectedCategoryId === ALL_CATEGORIES
                        ? 'shrink-0 rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white shadow-sm'
                        : 'shrink-0 rounded-full border border-black/10 bg-white px-4 py-1.5 text-xs font-semibold text-black/60 transition hover:border-accent/30 hover:text-accent'
                    }
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
                        className={
                          active
                            ? 'shrink-0 rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white shadow-sm'
                            : 'shrink-0 rounded-full border border-black/10 bg-white px-4 py-1.5 text-xs font-semibold text-black/60 transition hover:border-accent/30 hover:text-accent'
                        }
                      >
                        {toTitleCase(category.name)}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <div className="text-xs text-black/45">
                {filteredProducts.length === 0
                  ? selectedCategory
                    ? `No products in ${toTitleCase(selectedCategory.name)}`
                    : 'No products to show'
                  : selectedCategory
                  ? `Showing ${filteredProducts.length} ${filteredProducts.length === 1 ? 'product' : 'products'} in ${toTitleCase(selectedCategory.name)}`
                  : `Showing ${filteredProducts.length} ${filteredProducts.length === 1 ? 'product' : 'products'}`}
              </div>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-black/10 bg-white px-6 py-16 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accentSoft text-accent">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                  </svg>
                </div>
                <div className="text-sm font-medium text-ink">
                  {searchQuery ? `No products match "${searchQuery}"` : 'This store has not published products yet.'}
                </div>
                {searchQuery ? (
                  <div className="mt-1 text-xs text-black/50">Try a different word or clear the search.</div>
                ) : null}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
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
                        className={`group flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 transition-all sm:rounded-[1.5rem] ${
                          inStock
                            ? 'hover:-translate-y-0.5 hover:shadow-lg hover:ring-accent/15'
                            : 'opacity-70'
                        }`}
                      >
                        <div className="relative h-[100px] w-full overflow-hidden bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50 sm:h-32 lg:aspect-square lg:h-auto">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={displayName}
                              className={`h-full w-full object-cover transition-transform duration-300 ${inStock ? 'group-hover:scale-[1.03]' : 'grayscale'}`}
                            />
                          ) : (
                            <div className={`flex h-full w-full items-center justify-center ${inStock ? 'text-accent/45' : 'text-black/30'}`}>
                              <PackageIcon className="h-9 w-9 sm:h-10 sm:w-10 lg:h-14 lg:w-14" />
                            </div>
                          )}
                          {hasPromo && inStock ? (
                            <div
                              className="absolute left-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-sm sm:left-3 sm:top-3 sm:px-2.5 sm:py-1 sm:text-[10px]"
                              style={primaryStyle}
                            >
                              Promo {product.promoBuyQty}+{product.promoGetQty}
                            </div>
                          ) : null}
                          {!inStock ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/55 backdrop-blur-[1px]">
                              <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm">
                                Out of stock
                              </span>
                            </div>
                          ) : null}
                        </div>

                        <div className="flex flex-1 flex-col gap-2.5 p-3 sm:gap-3 sm:p-4">
                          <div className="min-h-[2.75rem]">
                            {displayCategory ? (
                              <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-accent/80 sm:text-[10px]">
                                {displayCategory}
                              </div>
                            ) : null}
                            <h2 className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-ink sm:text-base">
                              {displayName}
                            </h2>
                          </div>

                          {product.storefrontDescription ? (
                            <p className="hidden text-xs leading-5 text-black/55 sm:line-clamp-2">
                              {product.storefrontDescription}
                            </p>
                          ) : null}

                          <div className="flex items-baseline justify-between gap-2">
                            <div>
                              <div className="text-[9px] uppercase tracking-[0.18em] text-black/40 sm:text-[10px]">From</div>
                              <div className="text-base font-bold text-ink sm:text-lg">{unitPrice}</div>
                            </div>
                            <div className={`text-[10px] font-medium sm:text-[11px] ${inStock ? 'text-emerald-700' : 'text-rose-600'}`}>
                              {inStock ? 'In stock' : 'Unavailable'}
                            </div>
                          </div>

                          <div className="mt-auto space-y-2 pt-1">
                            {product.units.length > 1 ? (
                              <select
                                className="input h-9 text-xs sm:h-10 sm:text-sm"
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
                            ) : null}

                            <div className="flex items-center justify-between rounded-xl border border-black/10 bg-white px-1">
                              <button
                                type="button"
                                aria-label="Decrease quantity"
                                className="px-2.5 py-1.5 text-base text-black/55 transition hover:text-accent disabled:opacity-30"
                                disabled={(selected?.qtyInUnit ?? 1) <= 1 || !inStock}
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
                              <input
                                className="w-8 border-0 bg-transparent text-center text-sm font-semibold focus:outline-none"
                                type="number"
                                min={1}
                                value={selected?.qtyInUnit ?? 1}
                                onChange={(event) =>
                                  setSelectionState((prev) => ({
                                    ...prev,
                                    [product.id]: {
                                      ...(prev[product.id] ?? { unitId: product.units[0]?.id ?? '' }),
                                      qtyInUnit: Math.max(1, parseInt(event.target.value || '1', 10) || 1),
                                    },
                                  }))
                                }
                              />
                              <button
                                type="button"
                                aria-label="Increase quantity"
                                className="px-2.5 py-1.5 text-base text-black/55 transition hover:text-accent disabled:opacity-30"
                                disabled={!inStock}
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
                              className="w-full rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-black/15 disabled:text-white/70 disabled:shadow-none sm:text-sm"
                              style={inStock ? primaryStyle : undefined}
                              onClick={() => addToCart(product.id)}
                              disabled={!inStock}
                            >
                              {inStock ? 'Add to cart' : 'Out of stock'}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between rounded-2xl bg-white px-5 py-3 shadow-sm ring-1 ring-black/5">
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
                      <span className="ml-2 text-black/35">({filteredProducts.length} products)</span>
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
          </section>

          <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
            <div className="rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 ring-black/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accentSoft text-accent">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold text-ink">Your cart</h2>
                </div>
                {cartItemCount > 0 ? (
                  <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-white">
                    {cartItemCount}
                  </span>
                ) : (
                  <span className="text-xs text-black/40">Empty</span>
                )}
              </div>

              {cartDetails.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-black/10 bg-black/[0.02] px-4 py-8 text-center">
                  <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black/40 ring-1 ring-black/5">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272" />
                    </svg>
                  </div>
                  <div className="text-sm font-medium text-ink">Cart is empty</div>
                  <div className="mt-1 text-xs text-black/50">Tap "Add to cart" on a product to get started.</div>
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  {cartDetails.map((line) => (
                    <div key={line.id} className="rounded-2xl bg-black/[0.03] px-4 py-3 transition hover:bg-black/[0.05]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-ink">{toTitleCase(line.product.name)}</div>
                          <div className="mt-0.5 text-xs text-black/50">
                            {line.qtyInUnit} × {toTitleCase(line.unit.name)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-ink">{formatMoney(line.total, storefront.currency)}</div>
                          <button
                            type="button"
                            className="mt-1 text-xs font-medium text-rose-600 transition hover:text-rose-700"
                            onClick={() => setCart((prev) => prev.filter((candidate) => candidate.id !== line.id))}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-5 space-y-2 border-t border-black/5 pt-4 text-sm">
                <div className="flex items-center justify-between text-black/60">
                  <span>Subtotal</span>
                  <span>{formatMoney(totals.netSubtotal, storefront.currency)}</span>
                </div>
                {totals.vat > 0 ? (
                  <div className="flex items-center justify-between text-black/60">
                    <span>VAT</span>
                    <span>{formatMoney(totals.vat, storefront.currency)}</span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between border-t border-black/5 pt-3 text-base font-bold text-ink">
                  <span>Total</span>
                  <span className="text-xl">{formatMoney(orderTotal, storefront.currency)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 ring-black/5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-ink">Checkout</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Mobile money
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-black/50">Your name</label>
                  <input
                    className="input mt-1"
                    placeholder="Full name"
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-black/50">Mobile money number</label>
                  <input
                    className="input mt-1"
                    placeholder="e.g. 024 123 4567"
                    value={customerPhone}
                    onChange={(event) => setCustomerPhone(event.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-black/50">Network</label>
                  <select
                    className="input mt-1"
                    value={network}
                    onChange={(event) => setNetwork(event.target.value as 'MTN' | 'TELECEL' | 'AIRTELTIGO')}
                  >
                    <option value="MTN">MTN</option>
                    <option value="TELECEL">Telecel</option>
                    <option value="AIRTELTIGO">AirtelTigo</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-black/50">Email (optional)</label>
                  <input
                    className="input mt-1"
                    placeholder="you@example.com"
                    value={customerEmail}
                    onChange={(event) => setCustomerEmail(event.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-black/50">Pickup note (optional)</label>
                  <textarea
                    className="input mt-1 min-h-20"
                    placeholder="Anything the store should know about your pickup"
                    value={customerNotes}
                    onChange={(event) => setCustomerNotes(event.target.value)}
                  />
                </div>

                {storefront.pickupInstructions ? (
                  <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                    <div className="font-semibold">Pickup instructions</div>
                    <div className="mt-1">{storefront.pickupInstructions}</div>
                  </div>
                ) : null}

                {error ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                    {error}
                  </div>
                ) : null}

                <button
                  type="button"
                  className="w-full rounded-xl bg-gradient-to-r from-accent to-accent/80 px-4 py-3.5 text-base font-bold text-white shadow-lg shadow-accent/20 transition-all hover:shadow-xl hover:shadow-accent/30 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-black/15 disabled:bg-none disabled:text-white/70 disabled:shadow-none disabled:translate-y-0"
                  style={cart.length > 0 ? primaryStyle : undefined}
                  disabled={submitting || cart.length === 0}
                  onClick={submitCheckout}
                >
                  {submitting
                    ? 'Starting payment…'
                    : cart.length === 0
                    ? 'Place Order'
                    : `Place Order — ${formatMoney(orderTotal, storefront.currency)}`}
                </button>

                <div className="text-center text-[11px] text-black/40">
                  After placing your order, you&apos;ll receive payment instructions and a unique reference code.
                </div>
              </div>
            </div>
          </aside>
        </div>

        <footer className="mt-10 flex flex-col items-center gap-2 border-t border-black/5 pt-6 text-center">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] font-medium text-black/50">
            <span className="inline-flex items-center gap-1">
              <svg className="h-3 w-3 text-accent" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-3.75 11.25h16.5a1.5 1.5 0 001.5-1.5v-9a1.5 1.5 0 00-1.5-1.5H3.75a1.5 1.5 0 00-1.5 1.5v9a1.5 1.5 0 001.5 1.5z" />
              </svg>
              Secure mobile-money checkout
            </span>
            <span className="text-black/20">·</span>
            <span>Pickup only</span>
            <span className="text-black/20">·</span>
            <span>Powered by TillFlow</span>
          </div>
        </footer>
      </div>

      {shareToast ? (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <div className="pointer-events-auto rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white shadow-lg">
            {shareToast}
          </div>
        </div>
      ) : null}

      {cartItemCount > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4 xl:hidden">
          <a
            href="#checkout"
            onClick={(event) => {
              event.preventDefault();
              const target = document.querySelector('aside');
              target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="pointer-events-auto inline-flex items-center justify-between gap-4 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white shadow-2xl shadow-black/20"
          >
            <span className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-xs font-bold">
                {cartItemCount}
              </span>
              View cart
            </span>
            <span className="font-bold">{formatMoney(orderTotal, storefront.currency)}</span>
          </a>
        </div>
      ) : null}
    </div>
  );
}
