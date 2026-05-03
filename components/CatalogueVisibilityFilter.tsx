'use client';

import { useState } from 'react';
import { toggleStorefrontProductAction } from '@/app/actions/online-storefront';

type Product = {
  id: string;
  name: string;
  imageUrl: string | null;
  storefrontPublished: boolean;
  categoryName: string | null;
};

type StatusFilter = 'all' | 'published' | 'hidden';

export default function CatalogueVisibilityFilter({ products }: { products: Product[] }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const publishedCount = products.filter((p) => p.storefrontPublished).length;
  const hiddenCount = products.length - publishedCount;

  const filtered = products.filter((p) => {
    if (statusFilter === 'published' && !p.storefrontPublished) return false;
    if (statusFilter === 'hidden' && p.storefrontPublished) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.categoryName?.toLowerCase().includes(q) ?? false)
    );
  });

  const STATUS_TABS: { id: StatusFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: products.length },
    { id: 'published', label: 'Published', count: publishedCount },
    { id: 'hidden', label: 'Hidden', count: hiddenCount },
  ];

  return (
    <div>
      {/* Filter tabs */}
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
              ({tab.count})
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
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

      {filtered.length > 0 && (
        <div className="mb-2 text-[11px] text-black/40">
          {filtered.length === products.length
            ? `${products.length} products`
            : `${filtered.length} of ${products.length} products`}
        </div>
      )}

      {/* Compact product list */}
      <div className="divide-y divide-black/5 rounded-2xl border border-black/5 bg-white">
        {filtered.map((product) => (
          <div
            key={product.id}
            className="flex items-center gap-3 px-3 py-2.5 first:rounded-t-2xl last:rounded-b-2xl"
          >
            {/* Thumbnail */}
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="h-8 w-8 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accentSoft text-xs font-bold text-accent">
                {product.name.charAt(0).toUpperCase()}
              </div>
            )}

            {/* Name + category */}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ink">{product.name}</div>
              {product.categoryName ? (
                <div className="truncate text-[10px] text-black/40">{product.categoryName}</div>
              ) : null}
            </div>

            {/* Status badge + toggle button */}
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

        {filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-black/10 py-10 text-center">
            <div className="text-sm font-medium text-ink">
              {query ? `No products match "${query}"` : statusFilter === 'published' ? 'No published products yet' : statusFilter === 'hidden' ? 'All products are published' : 'No products found'}
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
    </div>
  );
}
