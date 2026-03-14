'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { generateLabelsHtmlAction } from '@/app/actions/labels';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import FormError from '@/components/FormError';
import LabelPreview from '@/components/LabelPreview';
import Pagination from '@/components/Pagination';
import PrintLabelsButton from '@/components/PrintLabelsButton';
import StatCard from '@/components/StatCard';
import { formatMoney } from '@/lib/format';
import { detectBarcodeFormat } from '@/lib/labels/detect-barcode-format';
import type { LabelData, LabelPrintMode, LabelSize } from '@/lib/labels/types';

const PAGE_SIZE = 12;

const templateOptions: Array<{ value: LabelSize; label: string; helper: string }> = [
  { value: 'SHELF_TAG', label: 'Shelf Tag', helper: '50 × 30 mm compact shelf edge labels' },
  { value: 'PRODUCT_STICKER', label: 'Product Sticker', helper: '60 × 40 mm detailed barcode stickers' },
  { value: 'A4_SHEET', label: 'A4 Sheet', helper: '24 labels per A4 page for bulk printing' },
];

type ClientProduct = {
  id: string;
  name: string;
  barcode: string | null;
  sku: string | null;
  sellingPriceBasePence: number;
  category: {
    id: string;
    name: string;
    colour: string;
  } | null;
  unit: string | null;
};

type ClientCategory = {
  id: string;
  name: string;
  colour: string;
};

type LabelPrintClientProps = {
  products: ClientProduct[];
  categories: ClientCategory[];
  currency: string;
  defaultTemplate: LabelSize;
  labelPrintMode: LabelPrintMode;
  labelPrinterName: string | null;
  initialSearch?: string;
  initialBarcode?: string;
  initialCategoryId?: string;
  initialPage?: number;
};

function clampQuantity(value: number | undefined) {
  return Math.max(1, Math.min(500, Math.floor(value || 1)));
}

function buildPreviewLabel(product: ClientProduct | undefined, currency: string): LabelData {
  if (!product) {
    return {
      productName: 'Select a product',
      price: `${currency} 0.00`,
      category: 'Preview',
      unit: 'unit',
      sku: '—',
      date: new Date().toISOString().slice(0, 10),
    };
  }

  return {
    productName: product.name,
    price: formatMoney(product.sellingPriceBasePence, currency),
    barcode: product.barcode ?? undefined,
    barcodeFormat: detectBarcodeFormat(product.barcode),
    category: product.category?.name ?? undefined,
    unit: product.unit ?? undefined,
    sku: product.sku ?? undefined,
    date: new Date().toISOString().slice(0, 10),
    currency,
  };
}

function writeHtmlToWindow(targetWindow: Window, html: string) {
  if (targetWindow.closed) {
    throw new Error('The preview window was closed before labels were ready.');
  }

  targetWindow.document.open();
  targetWindow.document.write(html);
  targetWindow.document.close();
}

export default function LabelPrintClient({
  products,
  categories,
  currency,
  defaultTemplate,
  labelPrintMode,
  labelPrinterName,
  initialSearch = '',
  initialBarcode = '',
  initialCategoryId = 'ALL',
  initialPage = 1,
}: LabelPrintClientProps) {
  const pathname = usePathname();
  const [search, setSearch] = useState(initialSearch);
  const [barcodeSearch, setBarcodeSearch] = useState(initialBarcode);
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [template, setTemplate] = useState<LabelSize>(defaultTemplate);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [currentPage, setCurrentPage] = useState(Math.max(1, initialPage));
  const [previewError, setPreviewError] = useState<string | undefined>();
  const [previewPending, startPreview] = useTransition();
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, barcodeSearch, categoryId]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const normalizedBarcode = barcodeSearch.trim().toLowerCase();

    return products.filter((product) => {
      const matchesName =
        normalizedSearch.length === 0 ||
        product.name.toLowerCase().includes(normalizedSearch) ||
        (product.sku ?? '').toLowerCase().includes(normalizedSearch);

      const matchesCategory =
        categoryId === 'ALL' ||
        (categoryId === 'UNCATEGORISED' ? !product.category : product.category?.id === categoryId);
      const matchesBarcode =
        normalizedBarcode.length === 0 || (product.barcode ?? '').toLowerCase().includes(normalizedBarcode);

      return matchesName && matchesCategory && matchesBarcode;
    });
  }, [barcodeSearch, categoryId, products, search]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  const visibleProducts = useMemo(() => {
    const start = (safeCurrentPage - 1) * PAGE_SIZE;
    return filteredProducts.slice(start, start + PAGE_SIZE);
  }, [filteredProducts, safeCurrentPage]);

  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const visibleIds = visibleProducts.map((product) => product.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIdSet.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIdSet.has(id));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
    }
  }, [allVisibleSelected, someVisibleSelected]);

  const selectedProducts = useMemo(
    () =>
      selectedIds
        .map((id) => productMap.get(id))
        .filter((product): product is ClientProduct => Boolean(product))
        .map((product) => ({
          product,
          quantity: clampQuantity(quantities[product.id]),
        })),
    [productMap, quantities, selectedIds],
  );

  const totalLabels = selectedProducts.reduce((sum, item) => sum + item.quantity, 0);
  const previewProduct = selectedProducts[0]?.product ?? visibleProducts[0] ?? filteredProducts[0];
  const previewLabel = buildPreviewLabel(previewProduct, currency);

  const toggleProduct = (productId: string, checked: boolean) => {
    setPreviewError(undefined);
    setSelectedIds((current) => {
      if (checked) {
        return current.includes(productId) ? current : [...current, productId];
      }

      return current.filter((id) => id !== productId);
    });

    if (checked) {
      setQuantities((current) => ({ ...current, [productId]: clampQuantity(current[productId]) }));
    }
  };

  const toggleAllVisible = (checked: boolean) => {
    setPreviewError(undefined);

    if (checked) {
      setSelectedIds((current) => {
        const next = new Set(current);
        visibleIds.forEach((id) => next.add(id));
        return [...next];
      });
      setQuantities((current) => {
        const next = { ...current };
        visibleIds.forEach((id) => {
          next[id] = clampQuantity(next[id]);
        });
        return next;
      });
      return;
    }

    setSelectedIds((current) => current.filter((id) => !visibleIds.includes(id)));
  };

  const updateQuantity = (productId: string, rawValue: string) => {
    const parsed = Math.max(1, Math.min(500, parseInt(rawValue || '1', 10) || 1));
    setQuantities((current) => ({ ...current, [productId]: parsed }));
  };

  const handlePreview = () => {
    if (selectedProducts.length === 0) {
      setPreviewError('Select at least one product before previewing labels.');
      return;
    }

    setPreviewError(undefined);
    const popup = window.open('', '_blank');

    if (!popup) {
      setPreviewError('Allow pop-ups for TillFlow to open the label preview window.');
      return;
    }

    popup.document.write('<title>Generating labels…</title><body style="font-family:system-ui;padding:24px;">Generating label preview…</body>');

    startPreview(async () => {
      const result = await generateLabelsHtmlAction({
        products: selectedProducts.map(({ product, quantity }) => ({
          productId: product.id,
          quantity,
        })),
        template,
      });

      if (!result.success) {
        if (!popup.closed) {
          popup.close();
        }
        setPreviewError(result.error);
        return;
      }

      try {
        writeHtmlToWindow(popup, result.data.html);
      } catch (error) {
        console.error('[labels] Failed to write preview window', error);
        setPreviewError('The preview window was closed before the labels were ready. Please try again.');
      }
    });
  };

  if (products.length === 0) {
    return (
      <EmptyState
        icon="box"
        title="No products available for labels yet"
        subtitle="Create a few products first, then return here to print shelf tags and barcode stickers."
        cta={{ label: 'Create products', href: '/products' }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Products loaded"
          value={String(products.length)}
          helper="All active products are available for filtering and label selection."
        />
        <StatCard
          label="Selected products"
          value={String(selectedProducts.length)}
          tone={selectedProducts.length > 0 ? 'accent' : 'default'}
          helper="Multi-select products and set a quantity for each one."
        />
        <StatCard
          label="Labels queued"
          value={String(totalLabels)}
          tone={totalLabels > 0 ? 'success' : 'default'}
          helper="This total updates instantly as quantities change."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
        <div className="space-y-6">
          <div className="card p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-display font-semibold">Find products to label</h2>
                <p className="mt-1 text-sm text-black/55">
                  Filter the catalog, tick the products you want, then preview or print in one batch.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">{filteredProducts.length} matching</Badge>
                <Badge tone={labelPrintMode === 'ZPL_DIRECT' ? 'warn' : 'info'}>
                  {labelPrintMode === 'ZPL_DIRECT' ? 'ZPL default saved' : 'Browser/PDF default saved'}
                </Badge>
                {labelPrinterName ? <Badge tone="neutral">Printer: {labelPrinterName}</Badge> : null}
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div>
                <label htmlFor="label-search" className="label">Search by name or SKU</label>
                <input
                  id="label-search"
                  className="input"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="e.g. Milo"
                />
              </div>
              <div>
                <label htmlFor="label-category" className="label">Category</label>
                <select
                  id="label-category"
                  className="input"
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  <option value="ALL">All categories</option>
                  <option value="UNCATEGORISED">Uncategorised</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="barcode-search" className="label">Barcode contains</label>
                <input
                  id="barcode-search"
                  className="input"
                  value={barcodeSearch}
                  onChange={(event) => setBarcodeSearch(event.target.value)}
                  placeholder="e.g. 603400..."
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-black/50">
              <span>Selection stays on this page until you change it.</span>
              {search || barcodeSearch || categoryId !== 'ALL' ? (
                <button
                  type="button"
                  className="text-accent underline underline-offset-2"
                  onClick={() => {
                    setSearch('');
                    setBarcodeSearch('');
                    setCategoryId('ALL');
                  }}
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          </div>

          <div className="card p-6 overflow-x-auto">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-display font-semibold">Product label queue</h2>
                <p className="mt-1 text-sm text-black/55">
                  Select items from the current page and set how many copies to print.
                </p>
              </div>
              <Badge tone={selectedProducts.length > 0 ? 'success' : 'neutral'}>
                {selectedProducts.length} selected
              </Badge>
            </div>

            {filteredProducts.length === 0 ? (
              <EmptyState
                icon="receipt"
                title="No products match your filters"
                subtitle="Try a broader name search, switch categories, or clear the barcode filter."
              />
            ) : (
              <>
                <table className="table w-full border-separate border-spacing-y-2">
                  <thead>
                    <tr>
                      <th className="w-12 px-3 py-2 text-left">
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          className="h-4 w-4"
                          checked={allVisibleSelected}
                          onChange={(event) => toggleAllVisible(event.target.checked)}
                          aria-label="Select all products on this page"
                        />
                      </th>
                      <th className="px-3 py-2 text-left">Product</th>
                      <th className="px-3 py-2 text-left">Barcode</th>
                      <th className="px-3 py-2 text-left">Price</th>
                      <th className="px-3 py-2 text-left">Category</th>
                      <th className="px-3 py-2 text-left">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleProducts.map((product) => {
                      const isSelected = selectedIdSet.has(product.id);
                      const quantity = clampQuantity(quantities[product.id]);

                      return (
                        <tr key={product.id} className={`rounded-xl ${isSelected ? 'bg-blue-50/70' : 'bg-white'}`}>
                          <td className="px-3 py-3 align-top">
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4"
                              checked={isSelected}
                              onChange={(event) => toggleProduct(product.id, event.target.checked)}
                              aria-label={`Select ${product.name}`}
                            />
                          </td>
                          <td className="px-3 py-3 align-top">
                            <div className="font-semibold text-ink">
                              <Link href={`/products/${product.id}`} className="hover:underline">
                                {product.name}
                              </Link>
                            </div>
                            {product.sku ? <div className="mt-1 text-xs text-black/45">SKU: {product.sku}</div> : null}
                          </td>
                          <td className="px-3 py-3 align-top text-sm text-black/65">
                            {product.barcode || <span className="text-black/30">—</span>}
                          </td>
                          <td className="px-3 py-3 align-top">{formatMoney(product.sellingPriceBasePence, currency)}</td>
                          <td className="px-3 py-3 align-top">
                            {product.category ? (
                              <span
                                className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                                style={{ backgroundColor: product.category.colour }}
                              >
                                {product.category.name}
                              </span>
                            ) : (
                              <span className="text-xs text-black/35">Uncategorised</span>
                            )}
                          </td>
                          <td className="px-3 py-3 align-top">
                            <input
                              type="number"
                              min={1}
                              max={500}
                              inputMode="numeric"
                              className="input min-w-[88px]"
                              value={quantity}
                              disabled={!isSelected}
                              onChange={(event) => updateQuantity(product.id, event.target.value)}
                              aria-label={`Quantity for ${product.name}`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <Pagination
                  currentPage={safeCurrentPage}
                  totalPages={totalPages}
                  basePath={pathname}
                  searchParams={{
                    q: search || undefined,
                    barcode: barcodeSearch || undefined,
                    category: categoryId !== 'ALL' ? categoryId : undefined,
                  }}
                />
              </>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <LabelPreview data={previewLabel} size={template} />

          <div className="card p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-display font-semibold">Template & output</h2>
                <p className="mt-1 text-sm text-black/55">
                  Choose a label format, preview the first selected item, then print the full batch.
                </p>
              </div>
              <Badge tone="info">{templateOptions.find((option) => option.value === template)?.label}</Badge>
            </div>

            <div className="mt-5">
              <label htmlFor="template" className="label">Label template</label>
              <select
                id="template"
                className="input"
                value={template}
                onChange={(event) => setTemplate(event.target.value as LabelSize)}
              >
                {templateOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="mt-2 text-xs text-black/50">
                {templateOptions.find((option) => option.value === template)?.helper}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-600">
              <div className="font-semibold text-slate-800">Current defaults</div>
              <div className="mt-2 space-y-1">
                <div>Saved print mode: {labelPrintMode === 'ZPL_DIRECT' ? 'ZPL Direct' : 'Browser / PDF'}</div>
                <div>Saved printer: {labelPrinterName || 'System default printer'}</div>
                <div>Preview source: {selectedProducts[0]?.product.name ?? previewProduct?.name ?? 'No product selected yet'}</div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/80 p-4 text-sm text-blue-900">
              <div className="font-semibold">Ready to print</div>
              <div className="mt-2">
                {selectedProducts.length > 0
                  ? `${selectedProducts.length} product${selectedProducts.length === 1 ? '' : 's'} selected across ${totalLabels} label${totalLabels === 1 ? '' : 's'}.`
                  : 'Select products in the table to enable preview and print.'}
              </div>
            </div>

            <div className="mt-5">
              <FormError error={previewError} />
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                className="btn-secondary justify-center"
                onClick={handlePreview}
                disabled={selectedProducts.length === 0 || previewPending}
              >
                {previewPending ? 'Generating Preview…' : 'Preview Labels'}
              </button>
              <PrintLabelsButton
                selectedProducts={selectedProducts}
                template={template}
                className="btn-primary"
                onError={setPreviewError}
              />
            </div>

            <div className="mt-4 text-xs text-black/45">
              Preview opens a new tab with the rendered HTML. Print opens the same type of view and immediately starts the browser print dialog.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
