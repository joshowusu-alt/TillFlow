'use client';
import { useEffect, useRef, useState } from 'react';

export default function ProductMarginPreview({ currency }: { currency: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [prices, setPrices] = useState({ cost: 0, sell: 0 });
  useEffect(() => {
    const form = ref.current?.closest('form');
    if (!form) return;
    const read = () => {
      const value = (name: string) => Number((form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? 0);
      setPrices({ cost: value('defaultCostBasePence'), sell: value('sellingPriceBasePence') });
    };
    read(); form.addEventListener('input', read);
    return () => form.removeEventListener('input', read);
  }, []);
  return <div ref={ref}><ProductMarginResult currency={currency} cost={prices.cost} sell={prices.sell} /></div>;
}

export function ProductMarginResult({ currency, cost, sell }: { currency: string; cost: number; sell: number }) {
  const profit = sell - cost;
  const money = (value: number) => new Intl.NumberFormat('en-GH', { style: 'currency', currency }).format(value);
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" role="status" aria-live="polite">
    <p className="text-sm font-semibold">Estimated gross profit per base unit</p>
    <p className="mt-1 text-sm">{cost > 0 && sell > 0 ? `${money(profit)} · ${(profit / sell * 100).toFixed(1)}% margin · ${(profit / cost * 100).toFixed(1)}% markup` : 'Enter cost and selling price to calculate.'}</p>
    <p className="mt-2 text-xs text-slate-600">Estimate from the entered prices on the same tax basis, before discounts and operating expenses. Actual sales margins use recorded stock costs.</p>
  </div>;
}
