'use client';

import type { Ingredient } from '@/lib/food/ingredient-costs';

export type IngredientOption = { id: string; name: string; unit: string };

export default function IngredientRows({ products, rows, onChange }: {
  products: IngredientOption[]; rows: Ingredient[]; onChange: (rows: Ingredient[]) => void;
}) {
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <select required aria-label="Stock ingredient" className="input flex-1" value={row.productId}
            onChange={event => onChange(rows.map((item, i) => i === index ? { ...item, productId: event.target.value } : item))}>
            <option value="">Choose ingredient</option>
            {products.map(product => <option key={product.id} value={product.id}>{product.name} ({product.unit})</option>)}
          </select>
          <input required aria-label="Ingredient quantity" className="input w-24" type="number" min={1} max={1000000} step={1} value={row.qty || ''}
            onChange={event => onChange(rows.map((item, i) => i === index ? { ...item, qty: Number(event.target.value) } : item))} />
          <button type="button" className="btn-secondary" onClick={() => onChange(rows.filter((_, i) => i !== index))}>Remove</button>
        </div>
      ))}
      <button type="button" className="btn-secondary" disabled={!products.length || rows.length >= 30}
        onClick={() => onChange([...rows, { productId: '', qty: 1 }])}>Add ingredient</button>
    </div>
  );
}
