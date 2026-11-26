'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { changeNewQuickPurchaseItem, createQuickPurchaseProduct, saveQuickPurchase } from '@/app/actions/quick-purchases';
import { formatMoney } from '@/lib/format';
import { purchaseDiscountBps } from '@/lib/purchases/discounts';
import { QUICK_CASH_SOURCES, quickCashShortfallMessage, quickCost, quickMoney, quickPurchaseProblem, quickPurchaseTotal, type QuickCashSource, type QuickRow, type QuickPayment, type QuickProduct, type QuickUnit } from '@/lib/purchases/quick';

type Choice = { id: string; name: string };
type Props = {
  storeId: string; products: QuickProduct[]; suppliers: Choice[]; units: QuickUnit[]; tills: Choice[];
  vatEnabled: boolean; photoRequired: boolean; role: string; businessCashPence: number;
};
const emptyRow = (key: number): QuickRow => ({ key, unitId: '', quantity: '', cost: '', expiry: '' });


function SaveBar({ children }: { children: React.ReactNode }) {
  const bar = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!mounted) return;
    const viewport = window.visualViewport;
    const place = () => {
      const keyboard = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
      if (bar.current) bar.current.style.bottom = keyboard > 0 ? keyboard + 'px' : '';
    };
    place();
    viewport?.addEventListener('resize', place);
    viewport?.addEventListener('scroll', place);
    window.addEventListener('resize', place);
    return () => {
      viewport?.removeEventListener('resize', place);
      viewport?.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
    };
  }, [mounted]);
  return mounted ? createPortal(
    <div ref={bar} className="fixed inset-x-0 bottom-[var(--mobile-bottom-nav-height)] lg:bottom-0 z-[60] border-t bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg">
      <div className="mx-auto flex max-w-xl flex-wrap items-center justify-between gap-2">{children}</div>
    </div>, document.body
  ) : null;
}

function ItemPicker({ row, products, choose, add }: {
  row: QuickRow; products: QuickProduct[]; choose: (product: QuickProduct) => void; add: (name: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const search = query.trim().toLowerCase();
  const matches = products.filter(product => product.name.toLowerCase().includes(search)).slice(0, 12);
  return <div className="relative" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <label className="label" htmlFor={'item-' + row.key}>Item</label>
    <input id={'item-' + row.key} className="input text-base" placeholder="Search items" autoComplete="off"
      value={open ? query : row.product?.name ?? query} onFocus={() => { setQuery(''); setOpen(true); }}
      onChange={event => { setQuery(event.target.value); setOpen(true); }} />
    {open && <ul className="absolute z-10 mt-1 max-h-52 w-full overflow-auto rounded-xl border bg-white shadow-lg">
      {search && !products.some(product => product.name.trim().toLowerCase() === search) && <li><button type="button" className="min-h-11 w-full px-3 text-left underline"
        onMouseDown={event => event.preventDefault()}
        onClick={() => { add(query.trim()); setOpen(false); }}>+ Add &quot;{query.trim()}&quot; as new item</button></li>}
      {matches.map(product => <li key={product.id}><button type="button" className="min-h-11 w-full px-3 text-left hover:bg-black/5"
        onMouseDown={event => event.preventDefault()}
        onClick={() => { choose(product); setQuery(''); setOpen(false); }}>{product.name}</button></li>)}

    </ul>}
  </div>;
}

export default function QuickPurchaseForm(props: Props) {
  const router = useRouter();
  const [products, setProducts] = useState(props.products);
  const nextKey = useRef(1);
  const [rows, setRows] = useState([emptyRow(0)]);
  const [payment, setPayment] = useState<QuickPayment>('Cash');
  const [supplier, setSupplier] = useState('');
  const [till, setTill] = useState(props.tills.length === 1 ? props.tills[0].id : '');
  const [cashSource, setCashSource] = useState<QuickCashSource | ''>('');
  const [dueDate, setDueDate] = useState('');
  const [invoice, setInvoice] = useState('');
  const [discount, setDiscount] = useState('');
  const [additionalCost, setAdditionalCost] = useState('');
  const [problemId, setProblemId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const requestKey = useRef('');
  const [result, setResult] = useState<{ id: string; total: number; cashSource?: QuickCashSource; tillUsed: boolean }>();
  const [itemError, setItemError] = useState('');
  const [newRows, setNewRows] = useState<Set<number>>(new Set());
  const [change, setChange] = useState<{ row: number; unitId: string; resell: boolean; sellingPrice: string }>();
  const [creating, setCreating] = useState(false);
  const [quantityFocusRow, setQuantityFocusRow] = useState<number>();
  useEffect(() => {
    if (quantityFocusRow === undefined || creating) return;
    document.getElementById('qty-' + quantityFocusRow)?.focus();
    setQuantityFocusRow(undefined);
  }, [quantityFocusRow, creating]);
  const selected = rows.filter(row => row.product);
  const baseProblem = quickPurchaseProblem(rows, payment, supplier, false, false);
  let total = 0;
  let pricingProblem: { id: string; message: string } | undefined;
  let discountBps = 0;
  try { discountBps = purchaseDiscountBps(discount); } catch {
    pricingProblem = { id: 'quick-discount', message: 'Enter a discount from 0 to 100%' };
  }
  try { total = quickPurchaseTotal(rows, discountBps, props.vatEnabled); } catch {
    if (!baseProblem) pricingProblem = { id: 'item-' + rows[0].key, message: 'Check the purchase amounts' };
  }
  const extra = additionalCost ? quickMoney(additionalCost) : 0;
  if (!Number.isSafeInteger(extra) || extra > 2147483647) pricingProblem ??= { id: 'quick-delivery', message: 'Enter a valid delivery or other cost' };
  else total += extra;
  const isBusinessCashShort = total > props.businessCashPence;
  const shortfallMessage = quickCashShortfallMessage(props.role);
  const cashProblem = payment !== 'Cash' ? undefined : props.tills.length
    ? (!till ? { id: 'quick-till', message: 'Choose which till you paid from' } : undefined)
    : !cashSource
      ? { id: 'quick-cash-source', message: 'Choose where the cash came from' }
      : cashSource === 'BUSINESS_CASH' && isBusinessCashShort
        ? { id: 'quick-business-cash', message: shortfallMessage }
        : undefined;
  const problem = baseProblem ?? pricingProblem ?? cashProblem;
  const inputClass = (id: string) => 'input text-base' + (problemId === id && problem?.id === id ? ' ring-2 ring-red-500' : '');
  const changeRow = (key: number, changes: Partial<QuickRow>) => setRows(current => current.map(row => row.key === key ? { ...row, ...changes } : row));
  const chooseUnit = (key: number, product: QuickProduct, unitId: string) => {
    const lastCost = product.lastCosts?.[unitId];
    changeRow(key, { product, unitId, cost: lastCost === undefined ? '' : (lastCost / 100).toFixed(2) });
  };
  const chooseProduct = (key: number, product: QuickProduct) => {
    const unit = product.units.find(unit => unit.id === product.lastUnitId) ?? product.units.find(unit => unit.isBaseUnit) ?? product.units[0];
    const unitId = unit?.id ?? '';
    const lastCost = product.lastCosts?.[unitId];
    const newRow = emptyRow(nextKey.current++);
    setRows(current => {
      const updated = current.map(row => row.key === key ? {
        ...row, product, unitId, cost: lastCost === undefined ? '' : (lastCost / 100).toFixed(2),
      } : row);
      return current.at(-1)?.key === key && current.length < 151 ? [...updated, newRow] : updated;
    });
  };
  const highlight = ({ id, message }: { id: string; message: string }) => {
    setProblemId(id);
    setError(message);
    const field = document.getElementById(id);
    const details = field?.closest('details');
    if (details) details.open = true;
    field?.focus({ preventScroll: true });
    field?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  };

  async function save() {
    if (busy || creating || change) return;
    if (problem) return highlight(problem);
    setBusy(true);
    setError('');
    setProblemId('');
    try {
      requestKey.current ||= crypto.randomUUID();
      const saved = await saveQuickPurchase({
        storeId: props.storeId, supplierId: supplier, tillId: till, payment,
        supplierInvoiceNumber: invoice, dueDate, cashSource,
        discount, additionalCost, document: '', key: requestKey.current,
        rows: selected.map(row => ({ productId: row.product!.id, unitId: row.unitId, quantity: row.quantity, cost: row.cost, expiry: row.expiry })),
      });
      if (saved.success) setResult(saved.data);
      else {
        if (saved.error === shortfallMessage) highlight({ id: 'quick-business-cash', message: saved.error });
        setError(saved.error);
      }
    } catch {
      setError('Could not confirm the purchase. Try Save purchase again.');
    } finally {
      setBusy(false);
    }
  }

  function recordAnother() {
    setResult(undefined);
    setRows([emptyRow(nextKey.current++)]);
    setPayment('Cash');
    setSupplier('');
    setInvoice('');
    setDueDate('');
    setCashSource('');
    setDiscount('');
    setAdditionalCost('');
    requestKey.current = '';
    const updates = new Map<string, QuickProduct>();
    for (const row of selected) {
      const product = updates.get(row.product!.id) ?? row.product!;
      updates.set(product.id, { ...product, lastUnitId: row.unitId, lastCosts: { ...product.lastCosts, [row.unitId]: quickCost(row.cost) } });
    }
    setProducts(current => current.map(product => updates.get(product.id) ?? product));
    router.refresh();
  }

  if (result) return <section className="card space-y-4 p-5">
    <h1 className="text-2xl font-semibold">Purchase saved</h1>
    <p className="text-xl font-semibold">{formatMoney(result.total)}</p>
    <p>{payment === 'Pay later' ? 'Pay later' : 'Paid by ' + payment + (result.tillUsed ? ' · from the till' : result.cashSource ? ' · from ' + QUICK_CASH_SOURCES[result.cashSource].toLowerCase() : '')}</p>
    <p>Stock updated: {selected.map(row => row.product!.name + ' +' + row.quantity).join(', ')}</p>
    <div className="flex flex-wrap gap-3">
      <button type="button" className="btn-primary" onClick={recordAnother}>Record another</button>
      <Link className="btn-secondary" href={'/purchases/' + result.id}>View purchase</Link>
    </div>
  </section>;

  const supplierField = <div>
    <label className="block" htmlFor="quick-supplier">Supplier</label>
    <select id="quick-supplier" className={inputClass('quick-supplier')} value={supplier} onChange={event => setSupplier(event.target.value)}>
      <option value="">Choose supplier</option>
      {props.suppliers.map(option => <option value={option.id} key={option.id}>{option.name}</option>)}
    </select>
  </div>;

  return <div className="space-y-4">
    <fieldset disabled={busy} className="min-w-0 space-y-4">
    <header className="flex items-start justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">Record purchase</h1><p className="mt-1 text-black/65">What did you buy?</p></div>
    </header>

    {supplierField}
    {rows.map(row => {
      const unit = row.product?.units.find(option => option.id === row.unitId);
      const rowTotal = Number(row.quantity) * quickCost(row.cost);
      return <section key={row.key} className="card space-y-3 p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_2.75rem] items-end gap-2">
          <ItemPicker row={row} products={products} choose={product => {
            if (creating) return;
            setChange(current => current?.row === row.key ? undefined : current);
            setNewRows(current => new Set([...current].filter(key => key !== row.key)));
            chooseProduct(row.key, product);
          }} add={async name => {
            if (creating || busy) return;
            setCreating(true);
            setItemError('');
            try {
              const created = await createQuickPurchaseProduct({ name }, props.storeId);
              if (!created.success) { setItemError(created.error); return; }
              setProducts(current => current.some(item => item.id === created.data.id) ? current : [...current, created.data]);
              chooseProduct(row.key, created.data);
              if (created.data.created) setNewRows(current => new Set(current).add(row.key));
              setQuantityFocusRow(row.key);
            } catch {
              setItemError('Could not add this item. Try again.');
            } finally {
              setCreating(false);
            }
          }} />
          <button className="btn-secondary h-11 justify-center px-0" type="button" aria-label={'Remove ' + (row.product?.name ?? 'item')}
            onClick={() => { if (change?.row === row.key) setChange(undefined); setRows(current => current.length === 1 ? [emptyRow(nextKey.current++)] : current.filter(item => item.key !== row.key)); }}>×</button>
        </div>
        {row.product && <>
          {newRows.has(row.key) && <button type="button" className="text-sm underline" onClick={() => {
            setItemError('');
            const price = row.product?.sellingPriceBasePence ?? 0;
            setChange({ row: row.key, unitId: row.unitId, resell: price > 0, sellingPrice: price > 0 ? (price / 100).toFixed(2) : '' });
          }}>Change</button>}
          {change?.row === row.key && <div className="space-y-2">
            <label className="block">Unit<select className="input" value={change.unitId}
              onChange={event => setChange({ ...change, unitId: event.target.value })}>
              {props.units.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={change.resell}
              onChange={event => setChange({ ...change, resell: event.target.checked })} />I also sell this</label>
            {change.resell && <label className="block">Selling price (GH₵)<input className="input" inputMode="decimal"
              value={change.sellingPrice} onChange={event => setChange({ ...change, sellingPrice: event.target.value })} /></label>}
            <div className="flex gap-2">
              <button type="button" className="btn-primary" disabled={creating} onClick={async () => {
                setCreating(true);
                setItemError('');
                try {
                  const result = await changeNewQuickPurchaseItem({ id: row.product!.id, ...change }, props.storeId);
                  if (!result.success) { setItemError(result.error); return; }
                  setProducts(current => current.map(item => item.id === result.data.id ? result.data : item));
                  setRows(current => current.map(item => item.product?.id === result.data.id
                    ? { ...item, product: result.data, unitId: change.unitId } : item));
                  setChange(undefined);
                } catch {
                  setItemError('Could not change this item. Try again.');
                } finally {
                  setCreating(false);
                }
              }}>Save item</button>
              <button type="button" className="btn-secondary" disabled={creating} onClick={() => setChange(undefined)}>Cancel</button>
            </div>
          </div>}
          <div className="grid grid-cols-2 gap-3">
            <label className="min-w-0">How many{unit && row.product.units.length === 1 ? ' (' + (unit.pluralName ?? unit.name) + ')' : ''}
              <input id={'qty-' + row.key} className={inputClass('qty-' + row.key)} inputMode="numeric" value={row.quantity}
                onChange={event => changeRow(row.key, { quantity: event.target.value })}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    document.getElementById('cost-' + row.key)?.focus();
                  }
                }} />
            </label>
            <label className="min-w-0">Cost each (GH₵)
              <input id={'cost-' + row.key} className={inputClass('cost-' + row.key)} inputMode="decimal" value={row.cost}
                onChange={event => changeRow(row.key, { cost: event.target.value })} />
            </label>
          </div>
          <div className="flex items-end justify-between gap-2">
            {row.product.units.length > 1 && <label>Unit
              <select className="input text-base" value={row.unitId} onChange={event => chooseUnit(row.key, row.product!, event.target.value)}>
                {row.product.units.map(option => <option value={option.id} key={option.id}>{option.name}</option>)}
              </select>
            </label>}
            <p className="ml-auto font-semibold">{Number.isFinite(rowTotal) && row.quantity ? formatMoney(rowTotal) : '—'}</p>
          </div>
        </>}
      </section>;
    })}
    <button type="button" className="btn-secondary w-full justify-center" onClick={() => setRows(current => [...current, emptyRow(nextKey.current++)])}>+ Add another item</button>

    <fieldset className="card space-y-3 p-4">
      <legend className="px-1 font-semibold">How did you pay?</legend>
      <div className="grid grid-cols-3 gap-2">
        {(['Cash', 'MoMo', 'Pay later'] as const).map(option => <button type="button" key={option} aria-pressed={payment === option}
          className={payment === option ? 'btn-primary justify-center px-1' : 'btn-secondary justify-center px-1'} onClick={() => setPayment(option)}>{option === 'MoMo' ? 'Mobile Money' : option === 'Pay later' ? 'Owing' : option}</button>)}
      </div>
      {payment === 'Cash' && props.tills.length !== 1 && <div id="quick-till" tabIndex={-1}>
        {props.tills.length ? <label>Which till?
          <select className="input text-base" value={till} onChange={event => setTill(event.target.value)}>
            <option value="">Choose till</option>{props.tills.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </label> : <fieldset id="quick-cash-source" tabIndex={-1}
          className={problemId === 'quick-cash-source' && !cashSource ? 'rounded-lg ring-2 ring-red-500' : ''}>
          <legend className="mb-2 font-medium">Where did the cash come from?</legend>
          <div className={props.role === 'OWNER' ? 'grid grid-cols-2 items-start gap-2' : 'space-y-2'}>
            {props.role === 'OWNER' && <button type="button" aria-pressed={cashSource === 'OWNER_CAPITAL'}
              className={cashSource === 'OWNER_CAPITAL' ? 'btn-primary justify-center' : 'btn-secondary justify-center'}
              onClick={() => { setCashSource('OWNER_CAPITAL'); setError(''); }}>{QUICK_CASH_SOURCES.OWNER_CAPITAL}</button>}
            <div className={problemId === 'quick-business-cash' && (cashProblem?.id === problemId || error === shortfallMessage)
              ? 'rounded-lg ring-2 ring-red-500' : ''}>
              <button id="quick-business-cash" type="button" aria-pressed={cashSource === 'BUSINESS_CASH'}
                className={cashSource === 'BUSINESS_CASH' ? 'btn-primary w-full justify-center' : 'btn-secondary w-full justify-center'}
                onClick={() => { setCashSource('BUSINESS_CASH'); setError(''); }}>{QUICK_CASH_SOURCES.BUSINESS_CASH}</button>
              <p className="mt-1 text-sm">You have {formatMoney(props.businessCashPence)} recorded</p>
              {isBusinessCashShort && <Link className="mt-1 inline-block text-sm underline"
                href={'/purchases/cash?storeId=' + encodeURIComponent(props.storeId)}>Record cash given to you</Link>}
              {props.role !== 'OWNER' && <p className="mt-1 text-sm">Only the owner can record their own money.</p>}
            </div>
          </div>
        </fieldset>}
      </div>}
    </fieldset>

    <details className="card p-4">
      <summary className="cursor-pointer font-semibold">More details</summary>
      <div className="mt-4 space-y-3">
        {payment === 'Pay later' && <label className="block">Due date (optional)<input type="date" className="input text-base" value={dueDate} onChange={event => setDueDate(event.target.value)} /></label>}
        <label className="block">Supplier invoice number<input className="input text-base" maxLength={100} value={invoice} onChange={event => setInvoice(event.target.value)} /></label>
        {selected.map(row => <label key={row.key} className="block">Expiry date for {row.product!.name}<input className="input text-base" type="date" value={row.expiry} onChange={event => changeRow(row.key, { expiry: event.target.value })} /></label>)}
        <label className="block">Invoice discount (%)<input id="quick-discount" className={inputClass('quick-discount')} inputMode="decimal" value={discount} onChange={event => setDiscount(event.target.value)} /></label>
        <label className="block">Delivery or other costs (GH₵)<input id="quick-delivery" className={inputClass('quick-delivery')} inputMode="decimal" value={additionalCost} onChange={event => setAdditionalCost(event.target.value)} /></label>
      </div>
    </details>
    </fieldset>
    <SaveBar>
      <p className="font-semibold">{selected.length} {selected.length === 1 ? 'item' : 'items'} · {formatMoney(total)}</p>
      <button type="button" className="btn-primary min-h-12 grow justify-center sm:grow-0" onClick={save} disabled={busy || creating || Boolean(change)}>
        {busy ? 'Saving…' : problem?.message ?? 'Save purchase'}
      </button>
      {error && (!problemId || (problemId === problem?.id && !selected.length) || (error === shortfallMessage && !problem && payment === 'Cash' && cashSource === 'BUSINESS_CASH')) && <p className="w-full text-sm font-medium text-red-700" role="alert">{error}</p>}
    </SaveBar>
    {itemError && <p role="alert" className="text-sm text-red-700">{itemError}</p>}
  </div>;
}
