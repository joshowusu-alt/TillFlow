'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toggleStorefrontProductAction } from '@/app/actions/online-storefront';
import { useToast } from '@/components/ToastProvider';

type Product = {
  id: string;
  name: string;
  barcode: string | null;
  imageUrl: string | null;
  storefrontPublished: boolean;
  categoryName: string | null;
  sellingPriceBasePence: number;
};

type StatusFilter = 'all' | 'published' | 'hidden' | 'missing-images';

type CatalogueApiProduct = {
  id: string;
  name: string;
  barcode: string | null;
  imageUrl: string | null;
  storefrontPublished: boolean;
  sellingPriceBasePence: number;
  category: { name: string } | null;
};

type CatalogueResponse = {
  products: CatalogueApiProduct[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

const PAGE_SIZE = 50;

function buildImageSearchQueries(product: Product) {
  const base = product.name.trim();
  const category = product.categoryName?.trim();
  const queries = [
    `${base} product image`,
    category ? `${base} ${category} Ghana product image` : `${base} Ghana product image`,
    product.barcode ? `${product.barcode} product image` : null,
  ].filter(Boolean) as string[];

  return Array.from(new Set(queries));
}

function imageSearchUrl(provider: 'google' | 'bing', query: string) {
  const encoded = encodeURIComponent(query);
  if (provider === 'bing') return `https://www.bing.com/images/search?q=${encoded}`;
  return `https://www.google.com/search?tbm=isch&q=${encoded}`;
}

function normalizeProduct(product: CatalogueApiProduct): Product {
  return {
    id: product.id,
    name: product.name,
    barcode: product.barcode,
    imageUrl: product.imageUrl,
    storefrontPublished: product.storefrontPublished,
    categoryName: product.category?.name ?? null,
    sellingPriceBasePence: product.sellingPriceBasePence,
  };
}

function Spinner() {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin text-black/45"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4Z"
      />
    </svg>
  );
}

export default function CatalogueVisibilityFilter({
  initialProducts,
  initialTotal,
}: {
  initialProducts?: Product[];
  initialTotal?: number;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [products, setProducts] = useState<Product[]>(initialProducts ?? []);
  const [total, setTotal] = useState(initialTotal ?? initialProducts?.length ?? 0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(
    Boolean(initialProducts && initialTotal && initialProducts.length < initialTotal),
  );
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedUploadProductId, setSelectedUploadProductId] = useState<string | null>(null);
  const [uploadingProductId, setUploadingProductId] = useState<string | null>(null);
  const [uploadErrorProductId, setUploadErrorProductId] = useState<string | null>(null);
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(null);
  const [imageAssistantProductId, setImageAssistantProductId] = useState<string | null>(null);
  const [externalImageUrl, setExternalImageUrl] = useState('');
  const [externalImageSavingProductId, setExternalImageSavingProductId] = useState<string | null>(null);
  const [externalImageError, setExternalImageError] = useState<string | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    updated: Array<{ productId: string; productName: string; imageUrl: string; fileName: string }>;
    skipped: Array<{ fileName: string; reason: string }>;
  } | null>(null);
  const [failedImages, setFailedImages] = useState<ReadonlySet<string>>(new Set());
  const [countsByStatus, setCountsByStatus] = useState<Partial<Record<StatusFilter, number>>>(
    initialTotal === undefined ? {} : { all: initialTotal },
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const fetchProducts = useCallback(
    async ({
      nextPage,
      append,
      signal,
    }: {
      nextPage: number;
      append: boolean;
      signal?: AbortSignal;
    }) => {
      setLoading(true);
      setFetchError(null);

      try {
        const params = new URLSearchParams({
          status: statusFilter,
          page: String(nextPage),
          limit: String(PAGE_SIZE),
        });
        if (debouncedQuery) params.set('q', debouncedQuery);

        const response = await fetch(`/api/settings/storefront-catalogue?${params.toString()}`, {
          method: 'GET',
          credentials: 'same-origin',
          signal,
        });

        let payload: CatalogueResponse | { error?: string };
        try {
          payload = await response.json();
        } catch {
          payload = {};
        }

        if (!response.ok) {
          const message =
            typeof payload === 'object' && payload && 'error' in payload && payload.error
              ? payload.error
              : 'Could not load products right now.';
          throw new Error(message);
        }

        const data = payload as CatalogueResponse;
        const nextProducts = data.products.map(normalizeProduct);

        setProducts((current) => (append ? [...current, ...nextProducts] : nextProducts));
        setTotal(data.total);
        setPage(data.page);
        setHasMore(data.hasMore);
        setCountsByStatus((current) => ({ ...current, [statusFilter]: data.total }));
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        const message =
          error instanceof Error ? error.message : 'Could not load products right now.';
        setFetchError(message);
        if (!append) {
          setProducts([]);
          setTotal(0);
          setHasMore(false);
        }
        if (message.toLowerCase().includes('unauthorized')) {
          toast('Your session expired. Please sign in again.', 'error');
        }
      } finally {
        setLoading(false);
      }
    },
    [debouncedQuery, statusFilter, toast],
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchProducts({ nextPage: 1, append: false, signal: controller.signal });
    return () => controller.abort();
  }, [fetchProducts]);

  const STATUS_TABS = useMemo(
    () =>
      ([
        { id: 'all', label: 'All' },
        { id: 'published', label: 'Published' },
        { id: 'hidden', label: 'Hidden' },
        { id: 'missing-images', label: 'Missing images' },
      ] as const).map((tab) => ({
        ...tab,
        count: loading && statusFilter === tab.id ? null : countsByStatus[tab.id] ?? null,
      })),
    [countsByStatus, loading, statusFilter],
  );

  async function handleLoadMore() {
    if (loading || !hasMore) return;
    await fetchProducts({ nextPage: page + 1, append: true });
  }

  function openUploadPicker(productId: string) {
    setSelectedUploadProductId(productId);
    setUploadErrorProductId(null);
    setUploadErrorMessage(null);
    fileInputRef.current?.click();
  }

  async function handleImageSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const productId = selectedUploadProductId;
    event.target.value = '';

    if (!file || !productId) return;

    setUploadingProductId(productId);
    setUploadErrorProductId(null);
    setUploadErrorMessage(null);

    try {
      const formData = new FormData();
      formData.set('productId', productId);
      formData.set('imageFile', file);

      const response = await fetch('/api/settings/storefront-product-image', {
        method: 'POST',
        body: formData,
        credentials: 'same-origin',
      });

      const payload = (await response.json().catch(() => null)) as
        | { imageUrl?: string; error?: string }
        | null;

      if (!response.ok || !payload?.imageUrl) {
        throw new Error(payload?.error || 'Could not upload this image right now.');
      }

      setProducts((current) =>
        current.map((product) =>
          product.id === productId ? { ...product, imageUrl: payload.imageUrl ?? null } : product,
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not upload this image right now.';
      setUploadErrorProductId(productId);
      setUploadErrorMessage(message);
      toast(message, 'error');
    } finally {
      setUploadingProductId(null);
      setSelectedUploadProductId(null);
    }
  }

  function openImageAssistant(productId: string) {
    setImageAssistantProductId((current) => (current === productId ? null : productId));
    setExternalImageUrl('');
    setExternalImageError(null);
  }

  async function handleBulkImageSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    setBulkUploading(true);
    setBulkResult(null);

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('images', file));

      const response = await fetch('/api/settings/storefront-product-images/bulk', {
        method: 'POST',
        body: formData,
        credentials: 'same-origin',
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            updated?: Array<{ productId: string; productName: string; imageUrl: string; fileName: string }>;
            skipped?: Array<{ fileName: string; reason: string }>;
            error?: string;
          }
        | null;

      if (!response.ok || !payload) {
        throw new Error(payload?.error || 'Could not upload these images right now.');
      }

      const updated = payload.updated ?? [];
      const skipped = payload.skipped ?? [];
      const updatedByProduct = new Map(updated.map((item) => [item.productId, item.imageUrl]));

      setProducts((current) =>
        current.map((product) => {
          const imageUrl = updatedByProduct.get(product.id);
          return imageUrl ? { ...product, imageUrl } : product;
        }),
      );
      setBulkResult({ updated, skipped });
      toast(
        `${updated.length} image${updated.length === 1 ? '' : 's'} matched${skipped.length ? `, ${skipped.length} skipped` : ''}.`,
        skipped.length ? 'info' : 'success',
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not upload these images right now.';
      toast(message, 'error');
      setBulkResult({ updated: [], skipped: [{ fileName: 'Bulk upload', reason: message }] });
    } finally {
      setBulkUploading(false);
    }
  }

  async function saveExternalImageUrl(productId: string) {
    const imageUrl = externalImageUrl.trim();
    if (!imageUrl) {
      setExternalImageError('Paste a direct JPEG, PNG or WebP image URL first.');
      return;
    }

    setExternalImageSavingProductId(productId);
    setExternalImageError(null);

    try {
      const formData = new FormData();
      formData.set('productId', productId);
      formData.set('imageUrl', imageUrl);

      const response = await fetch('/api/settings/storefront-product-image', {
        method: 'POST',
        body: formData,
        credentials: 'same-origin',
      });
      const payload = (await response.json().catch(() => null)) as
        | { imageUrl?: string; error?: string }
        | null;

      if (!response.ok || !payload?.imageUrl) {
        throw new Error(payload?.error || 'Could not save this image URL.');
      }

      setProducts((current) =>
        current.map((product) =>
          product.id === productId ? { ...product, imageUrl: payload.imageUrl ?? null } : product,
        ),
      );
      setImageAssistantProductId(null);
      setExternalImageUrl('');
      toast('Product image saved.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save this image URL.';
      setExternalImageError(message);
      toast(message, 'error');
    } finally {
      setExternalImageSavingProductId(null);
    }
  }

  const summaryText =
    total > 0
      ? products.length === total
        ? `${total} product${total === 1 ? '' : 's'}`
        : `${products.length} of ${total} product${total === 1 ? '' : 's'} loaded`
      : null;

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleImageSelection}
      />
      <input
        ref={bulkFileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={handleBulkImageSelection}
      />

      <div className="mb-4 rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-sky-950">Bulk product images</div>
            <p className="mt-1 text-xs leading-5 text-sky-800/75">
              Upload JPEG, PNG or WebP files named after a product or barcode, for example <span className="font-mono">milo-500g.webp</span> or <span className="font-mono">6034001234567.jpg</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => bulkFileInputRef.current?.click()}
            disabled={bulkUploading}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-sky-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {bulkUploading ? 'Matching images...' : 'Upload many'}
          </button>
        </div>
        {bulkResult ? (
          <div className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-xs text-sky-950">
            <div className="font-semibold">
              {bulkResult.updated.length} matched, {bulkResult.skipped.length} skipped
            </div>
            {bulkResult.skipped.length > 0 ? (
              <details className="mt-1">
                <summary className="cursor-pointer text-sky-800">Review skipped files</summary>
                <ul className="mt-2 space-y-1 text-sky-900/75">
                  {bulkResult.skipped.slice(0, 12).map((item) => (
                    <li key={`${item.fileName}-${item.reason}`}>
                      <span className="font-medium">{item.fileName}</span>: {item.reason}
                    </li>
                  ))}
                  {bulkResult.skipped.length > 12 ? (
                    <li>+ {bulkResult.skipped.length - 12} more skipped files</li>
                  ) : null}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mb-3 flex gap-1 rounded-xl border border-black/5 bg-black/[0.03] p-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setStatusFilter(tab.id)}
            className={
              statusFilter === tab.id
                ? 'flex-1 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-ink shadow-sm'
                : 'flex-1 rounded-lg px-3 py-1.5 text-xs font-medium text-black/55 transition hover:text-ink'
            }
          >
            {tab.label}
            <span className={`ml-1 ${statusFilter === tab.id ? 'text-black/40' : 'text-black/30'}`}>
              ({tab.count ?? '—'})
            </span>
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center gap-3">
        <div className="relative flex-1">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="search"
            className="input pl-9"
            placeholder="Search by name or category…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {loading ? (
          <div className="inline-flex items-center gap-1.5 text-xs text-black/45">
            <Spinner />
            Loading
          </div>
        ) : null}
        {query && (
          <button
            type="button"
            className="text-sm font-medium text-black/50 hover:text-ink"
            onClick={() => setQuery('')}
          >
            Clear
          </button>
        )}
      </div>

      {fetchError ? (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {fetchError}
        </div>
      ) : null}

      {summaryText ? (
        <div className="mb-2 flex items-center gap-2 text-[11px] text-black/40">
          <span>{summaryText}</span>
          {loading ? <Spinner /> : null}
        </div>
      ) : null}

      <div className="divide-y divide-black/5 rounded-2xl border border-black/5 bg-white">
        {products.map((product) => (
          <div
            key={product.id}
            className="flex items-center gap-3 px-3 py-2.5 first:rounded-t-2xl last:rounded-b-2xl"
          >
            <div className="flex shrink-0 items-center gap-2">
              {product.imageUrl && !failedImages.has(product.id) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="h-8 w-8 shrink-0 rounded-lg object-cover"
                  onError={() =>
                    setFailedImages((prev) => {
                      const next = new Set(prev);
                      next.add(product.id);
                      return next;
                    })
                  }
                />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accentSoft text-xs font-bold text-accent">
                  {product.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex flex-col items-start">
                <button
                  type="button"
                  onClick={() => openUploadPicker(product.id)}
                  disabled={uploadingProductId === product.id}
                  className="rounded-full border border-black/10 bg-white px-2 py-1 text-[10px] font-semibold text-black/55 transition hover:border-black/20 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {uploadingProductId === product.id ? 'Uploading…' : '📷 Upload'}
                </button>
                <button
                  type="button"
                  onClick={() => openImageAssistant(product.id)}
                  className="mt-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-semibold text-sky-800 transition hover:border-sky-300 hover:bg-sky-100"
                >
                  Find image
                </button>
                {uploadErrorProductId === product.id && uploadErrorMessage ? (
                  <span className="mt-1 max-w-[110px] text-[10px] leading-4 text-rose-600">
                    {uploadErrorMessage}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ink">{product.name}</div>
              {product.categoryName ? (
                <div className="truncate text-[10px] text-black/40">{product.categoryName}</div>
              ) : null}
              {product.barcode ? (
                <div className="truncate text-[10px] text-black/30">{product.barcode}</div>
              ) : null}
              {imageAssistantProductId === product.id ? (
                <div className="mt-2 rounded-xl border border-sky-100 bg-sky-50/75 p-2">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-700">
                    Image assistant
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {buildImageSearchQueries(product).map((searchQuery) => (
                      <span key={searchQuery} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[10px] font-medium text-sky-900 ring-1 ring-sky-100">
                        {searchQuery}
                        <a
                          href={imageSearchUrl('google', searchQuery)}
                          target="_blank"
                          rel="noreferrer"
                          className="font-bold text-sky-700 hover:underline"
                        >
                          Google
                        </a>
                        <a
                          href={imageSearchUrl('bing', searchQuery)}
                          target="_blank"
                          rel="noreferrer"
                          className="font-bold text-sky-700 hover:underline"
                        >
                          Bing
                        </a>
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      type="url"
                      className="input h-10 flex-1 text-xs"
                      placeholder="Paste direct .jpg, .png or .webp URL"
                      value={externalImageUrl}
                      onChange={(event) => setExternalImageUrl(event.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => void saveExternalImageUrl(product.id)}
                      disabled={externalImageSavingProductId === product.id}
                      className="inline-flex h-10 items-center justify-center rounded-xl bg-sky-900 px-3 text-xs font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {externalImageSavingProductId === product.id ? 'Checking…' : 'Save URL'}
                    </button>
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-sky-800/70">
                    Use a clear product photo you are allowed to use. The URL must point directly to an image file.
                  </p>
                  {externalImageError ? (
                    <div className="mt-1 text-[10px] text-rose-600">{externalImageError}</div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span
                className={`hidden text-[10px] font-semibold sm:block ${
                  product.storefrontPublished ? 'text-emerald-600' : 'text-black/35'
                }`}
              >
                {product.storefrontPublished ? 'Live' : 'Hidden'}
              </span>
              <form action={toggleStorefrontProductAction}>
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="publish" value={product.storefrontPublished ? '0' : '1'} />
                <button
                  type="submit"
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                    product.storefrontPublished
                      ? 'border border-black/10 bg-white text-black/60 hover:border-black/20'
                      : 'border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20'
                  }`}
                >
                  {product.storefrontPublished ? 'Hide' : 'Publish'}
                </button>
              </form>
            </div>
          </div>
        ))}

        {products.length === 0 && (
          <div className="rounded-2xl border border-dashed border-black/10 py-10 text-center">
            <div className="text-sm font-medium text-ink">
              {query
                ? `No products match "${query}"`
                : statusFilter === 'published'
                  ? 'No published products yet'
                  : statusFilter === 'hidden'
                    ? 'All products are published'
                    : statusFilter === 'missing-images'
                      ? 'No published products are missing images'
                      : 'No products found'}
            </div>
            {query ? (
              <button
                type="button"
                className="mt-2 text-xs font-medium text-accent hover:underline"
                onClick={() => setQuery('')}
              >
                Clear search
              </button>
            ) : null}
          </div>
        )}
      </div>

      {hasMore ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => void handleLoadMore()}
            disabled={loading}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-black/60 transition hover:border-black/20 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
