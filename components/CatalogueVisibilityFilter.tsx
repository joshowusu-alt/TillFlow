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

export default function CatalogueVisibilityFilter({ products }: { products: Product[] }) {
  const [query, setQuery] = useState('');

  const filtered = query === ''
    ? products
    : products.filter(
        (p) =>
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          (p.categoryName?.toLowerCase().includes(query.toLowerCase()) ?? false),
      );

  return (
    <div>
      {/* Search input */}
      <div className="mb-4 flex items-center gap-3">
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

      {query && (
        <div className="mb-3 text-xs text-black/45">
          {filtered.length} of {products.length} products match
        </div>
      )}

      {/* Product list */}
      <div className="space-y-2">
        {filtered.map((product) => (
          <div
            key={product.id}
            className="flex flex-col gap-4 rounded-2xl border border-black/5 bg-black/[0.02] px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-3">
              {product.imageUrl ? (
                <img src={product.imageUrl} alt={product.name} className="h-12 w-12 shrink-0 rounded-xl object-cover" />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accentSoft text-lg font-bold text-accent">
                  {product.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <div className="font-medium text-ink">{product.name}</div>
                {product.categoryName ? (
                  <div className="text-[11px] text-black/40">{product.categoryName}</div>
                ) : null}
                <div className="mt-0.5 text-xs text-black/50">
                  {product.storefrontPublished ? 'Visible online' : 'Hidden from storefront'}
                </div>
              </div>
            </div>

            <form action={toggleStorefrontProductAction}>
              <input type="hidden" name="productId" value={product.id} />
              <input type="hidden" name="publish" value={product.storefrontPublished ? '0' : '1'} />
              <button type="submit" className={product.storefrontPublished ? 'btn-ghost' : 'btn-primary'}>
                {product.storefrontPublished ? 'Hide from storefront' : 'Publish online'}
              </button>
            </form>
          </div>
        ))}

        {filtered.length === 0 && query ? (
          <div className="rounded-2xl border border-dashed border-black/10 py-10 text-center">
            <div className="text-sm font-medium text-ink">No products match &ldquo;{query}&rdquo;</div>
            <button
              type="button"
              className="mt-2 text-xs font-medium text-accent hover:underline"
              onClick={() => setQuery('')}
            >
              Clear search
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
