'use client';

import { useState, useMemo } from 'react';
import type { DemoProduct, DemoCategory, DemoInventoryBalance } from '@/lib/demo-fixtures';

interface Props {
  products: DemoProduct[];
  categories: DemoCategory[];
  balances: Record<string, DemoInventoryBalance>;
  sym: string;
}

export default function POSCategoryFilter({ products, categories, balances, sym }: Props) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let list = products;
    if (activeCategory) list = list.filter(p => p.categoryId === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.includes(q),
      );
    }
    return list;
  }, [products, activeCategory, search]);

  const grouped = useMemo(() => {
    if (activeCategory || search.trim()) return null; // flat list when filtered
    const map = new Map<string, DemoProduct[]>();
    for (const cat of categories) map.set(cat.id, []);
    for (const p of filtered) {
      map.get(p.categoryId)?.push(p);
    }
    return map;
  }, [filtered, categories, activeCategory, search]);

  return (
    <div className="space-y-5">
      {/* Search + category pills */}
      <div className="space-y-3">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search products, barcode, SKU…"
          className="input w-full max-w-sm"
        />
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory(null)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              !activeCategory ? 'bg-accent text-white' : 'bg-black/5 text-black/60 hover:bg-black/10'
            }`}
          >
            All ({products.length})
          </button>
          {categories.map(cat => {
            const count = products.filter(p => p.categoryId === cat.id).length;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(isActive ? null : cat.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  isActive ? 'text-white' : 'bg-black/5 text-black/60 hover:bg-black/10'
                }`}
                style={isActive ? { background: cat.colour } : undefined}
              >
                {cat.name} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Product grid */}
      {grouped ? (
        categories
          .filter(cat => (grouped.get(cat.id) ?? []).length > 0)
          .map(cat => (
            <div key={cat.id}>
              <div
                className="mb-3 inline-flex items-center rounded-full px-3 py-1 text-xs font-bold text-white"
                style={{ background: cat.colour }}
              >
                {cat.name} · {(grouped.get(cat.id) ?? []).length} items
              </div>
              <ProductGrid
                products={grouped.get(cat.id) ?? []}
                balances={balances}
                sym={sym}
              />
            </div>
          ))
      ) : (
        <ProductGrid products={filtered} balances={balances} sym={sym} />
      )}

      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-black/15 py-12 text-center text-sm text-muted">
          No products match your search.
        </div>
      )}
    </div>
  );
}

function ProductGrid({
  products,
  balances,
  sym,
}: {
  products: DemoProduct[];
  balances: Record<string, DemoInventoryBalance>;
  sym: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {products.map(p => {
        const bal       = balances[p.id];
        const endingQty = bal?.endingQty ?? p.openingQty;
        const isLow     = endingQty <= p.reorderPoint;
        const isOut     = endingQty <= 0;

        return (
          <div
            key={p.id}
            className={`relative flex flex-col rounded-xl border bg-white p-3 shadow-sm transition-shadow hover:shadow ${
              isOut ? 'opacity-60' : ''
            }`}
            style={{ borderColor: isLow && !isOut ? '#f59e0b' : undefined }}
          >
            {/* Category image */}
            <div className="mb-2.5 flex h-14 items-center justify-center overflow-hidden rounded-lg bg-slate-50">
              <img
                src={p.imagePath}
                alt=""
                className="h-12 w-12 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>

            {/* Low/out badge */}
            {isOut ? (
              <span className="absolute right-2 top-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Out</span>
            ) : isLow ? (
              <span className="absolute right-2 top-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Low</span>
            ) : null}

            <div className="mb-0.5 text-xs font-medium text-muted uppercase tracking-wide truncate">{p.sku}</div>
            <div className="flex-1 text-xs font-semibold leading-snug text-ink line-clamp-2">{p.name}</div>
            <div className="mt-1.5 text-base font-bold text-accent tabular-nums">
              {sym}{(p.sellingPricePence / 100).toFixed(2)}
            </div>
            <div className="mt-0.5 text-xs text-muted">
              Stock: <span className={isLow ? 'font-semibold text-amber-600' : ''}>{endingQty}</span>
              {p.vatRateBps > 0 && <span className="ml-1 text-blue-400">+VAT</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
