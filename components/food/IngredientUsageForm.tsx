'use client';

import { useState } from 'react';
import { recordIngredientUsageAction } from '@/app/actions/food';
import type { Ingredient } from '@/lib/food/ingredient-costs';
import IngredientRows, { type IngredientOption } from './IngredientRows';
import { formatMoney } from '@/lib/format';

export default function IngredientUsageForm({ products, currency, storeId }: { products: IngredientOption[]; currency: string; storeId: string }) {
  const [rows, setRows] = useState<Ingredient[]>([]);
  const [key, setKey] = useState<string>();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  return <form className="card space-y-3 p-4" onSubmit={async event => {
    event.preventDefault();
    setPending(true);
    const requestKey = key ?? crypto.randomUUID();
    setKey(requestKey);
    try {
      const result = await recordIngredientUsageAction(rows, requestKey, storeId);
      setMessage(result.success
        ? result.data.replayed ? 'This usage was already recorded.' : `${formatMoney(result.data.value, currency)} recorded in Food costs.`
        : result.error);
      if (result.success) {
        setRows([]);
        setKey(undefined);
      }
    } finally {
      setPending(false);
    }
  }}>
    <h1 className="text-lg font-semibold">Ingredients used</h1>
    <p className="text-sm">Record today’s ingredients for food prepared without a recipe. Include only ingredients that still need to come out of stock.</p>
    <fieldset disabled={pending} className="space-y-3">
      <IngredientRows products={products} rows={rows} onChange={setRows} />
      <button className="btn-primary" disabled={!rows.length || pending}>{pending ? 'Saving…' : 'Record ingredients used'}</button>
    </fieldset>
    {message && <p role="status">{message}</p>}
  </form>;
}
