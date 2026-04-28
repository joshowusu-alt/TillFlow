'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatMoney } from '@/lib/format';
import { buildCartDetails, buildProductMap, formatAvailable, getUnitFromProduct, sumCartTotals, type PosCartLine } from '@/lib/payments/pos-cart';
import type { PublicStorefront } from '@/lib/services/online-orders';

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

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return productsForStore;
    return productsForStore.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.categoryName?.toLowerCase() ?? '').includes(q),
    );
  }, [productsForStore, searchQuery]);

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

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">TillFlow online store</div>
              <h1 className="mt-2 text-3xl font-display font-bold text-ink sm:text-4xl">{storefront.headline || storefront.name}</h1>
              <p className="mt-3 text-sm leading-6 text-black/60 sm:text-base">
                {storefront.description || 'Browse available products, build your cart, and pay with mobile money for pickup.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-black/55">
                {selectedStore?.phone ? <span className="rounded-full bg-black/[0.04] px-3 py-1.5">Call: {selectedStore.phone}</span> : storefront.phone ? <span className="rounded-full bg-black/[0.04] px-3 py-1.5">Call: {storefront.phone}</span> : null}
                <span className="rounded-full bg-black/[0.04] px-3 py-1.5">Pickup only</span>
                {selectedStore?.address ? <span className="rounded-full bg-black/[0.04] px-3 py-1.5">{selectedStore.address}</span> : storefront.address ? <span className="rounded-full bg-black/[0.04] px-3 py-1.5">{storefront.address}</span> : null}
              </div>

              {storefront.stores.length > 1 ? (
                <div className="mt-5">
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

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <div className="font-semibold">Payment method</div>
              <div className="mt-1">Mobile money checkout is enabled for this store.</div>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,2fr)_380px]">
          <section className="space-y-4">
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
                  placeholder="Search products…"
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

            {filteredProducts.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-black/10 bg-white px-6 py-12 text-center text-black/55">
                {searchQuery ? `No products match "${searchQuery}".` : 'This store has not published products yet.'}
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {pagedProducts.map((product) => {
                const selected = selectionState[product.id];
                const selectedUnit = selected ? getUnitFromProduct(product, selected.unitId) : undefined;
                const unitPrice = selectedUnit ? formatMoney(selectedUnit.sellingPricePence ?? product.sellingPriceBasePence * selectedUnit.conversionToBase, storefront.currency) : formatMoney(product.sellingPriceBasePence, storefront.currency);

                return (
                  <article key={product.id} className="rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 ring-black/5">
                    <div className="flex flex-col gap-5 sm:flex-row">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="h-28 w-full rounded-2xl object-cover sm:w-32"
                        />
                      ) : (
                        <div className="flex h-28 w-full items-center justify-center rounded-2xl bg-accentSoft text-3xl font-bold text-accent sm:w-32">
                          {product.name.charAt(0)}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h2 className="text-lg font-semibold text-ink">{product.name}</h2>
                            {product.categoryName ? (
                              <div className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-black/45">{product.categoryName}</div>
                            ) : null}
                            {product.storefrontDescription ? (
                              <p className="mt-3 text-sm leading-6 text-black/60">{product.storefrontDescription}</p>
                            ) : null}
                          </div>

                          <div className="rounded-xl bg-black/[0.04] px-3 py-2 text-right">
                            <div className="text-[11px] uppercase tracking-[0.2em] text-black/40">From</div>
                            <div className="mt-1 text-base font-semibold text-ink">{unitPrice}</div>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2 text-xs text-black/50">
                          <span className="rounded-full bg-black/[0.04] px-3 py-1.5">
                            Available: {formatAvailable(product, product.onHandBase)}
                          </span>
                          {product.promoBuyQty > 0 && product.promoGetQty > 0 ? (
                            <span className="rounded-full bg-accentSoft px-3 py-1.5 text-accent">
                              Promo {product.promoBuyQty} + {product.promoGetQty}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_100px_140px]">
                          <select
                            className="input"
                            value={selected?.unitId ?? ''}
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
                                {unit.name} - {formatMoney(unit.sellingPricePence ?? product.sellingPriceBasePence * unit.conversionToBase, storefront.currency)}
                              </option>
                            ))}
                          </select>

                          <input
                            className="input"
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
                            className="btn-primary"
                            onClick={() => addToCart(product.id)}
                            disabled={product.onHandBase <= 0}
                          >
                            {product.onHandBase > 0 ? 'Add to cart' : 'Out of stock'}
                          </button>
                        </div>
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
                <h2 className="text-lg font-semibold text-ink">Your cart</h2>
                <span className="text-sm text-black/45">{cartDetails.length} item{cartDetails.length === 1 ? '' : 's'}</span>
              </div>

              {cartDetails.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-black/10 px-4 py-6 text-sm text-black/50">
                  Add products from the catalogue to start checkout.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {cartDetails.map((line) => (
                    <div key={line.id} className="rounded-2xl bg-black/[0.03] px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-ink">{line.product.name}</div>
                          <div className="text-xs text-black/50">
                            {line.qtyInUnit} x {line.unit.name}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-ink">{formatMoney(line.total, storefront.currency)}</div>
                          <button
                            type="button"
                            className="mt-1 text-xs text-rose-600"
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
                <div className="flex items-center justify-between text-black/60">
                  <span>VAT</span>
                  <span>{formatMoney(totals.vat, storefront.currency)}</span>
                </div>
                <div className="flex items-center justify-between text-base font-semibold text-ink">
                  <span>Total</span>
                  <span>{formatMoney(orderTotal, storefront.currency)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-[1.5rem] bg-white p-5 shadow-sm ring-1 ring-black/5">
              <h2 className="text-lg font-semibold text-ink">Checkout</h2>
              <div className="mt-4 space-y-3">
                <input className="input" placeholder="Your full name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
                <input className="input" placeholder="Mobile money number" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} />
                <input className="input" placeholder="Email (optional)" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} />
                <select className="input" value={network} onChange={(event) => setNetwork(event.target.value as 'MTN' | 'TELECEL' | 'AIRTELTIGO')}>
                  <option value="MTN">MTN</option>
                  <option value="TELECEL">Telecel</option>
                  <option value="AIRTELTIGO">AirtelTigo</option>
                </select>
                <textarea
                  className="input min-h-24"
                  placeholder="Pickup note (optional)"
                  value={customerNotes}
                  onChange={(event) => setCustomerNotes(event.target.value)}
                />

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
                  className="btn-primary w-full justify-center"
                  disabled={submitting || cart.length === 0}
                  onClick={submitCheckout}
                >
                  {submitting ? 'Starting payment…' : `Pay ${formatMoney(orderTotal, storefront.currency)}`}
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
