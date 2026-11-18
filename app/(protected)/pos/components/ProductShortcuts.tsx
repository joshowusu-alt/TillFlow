'use client';

import { isDishAvailableToday } from '@/lib/food/dish-schedule';
import { useEffect, useMemo, useRef, useState } from 'react';
import { savePosShortcutsAction } from '@/app/actions/pos-shortcuts';
import { EMPTY_SHORTCUT_LAYOUT, parseShortcutLayout, type ShortcutLayout } from '@/lib/pos/shortcuts';
import type { SellableProductDto } from '@/lib/pos/sellable-dto';
import ResponsiveModal from '@/components/ResponsiveModal';
import { formatMoney } from '@/lib/format';
import Link from 'next/link';
import { dishSettingsHref } from '@/lib/food/business';
import { formatDishListPrice } from '@/lib/food/plate';

type Props = {
  businessId: string; storeId: string; currency: string;
  products: SellableProductDto[];
  serverCatalogue?: boolean;
  workspaceTab?: 'cart' | 'products';
  onWorkspaceTabChange?: (tab: 'cart' | 'products') => void;
  cartCount?: number;
  canManageDishes?: boolean;
  onProductLoaded: (product: SellableProductDto) => void;
  onSelect: (product: SellableProductDto) => void;
  getAvailable: (id: string) => number;
};

function cacheVisibleShortcuts(cacheKey: string, layout: ShortcutLayout, removed: Set<string>) {
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ screens: layout.screens.map(screen => ({
      ...screen, productIds: screen.productIds.filter(id => !removed.has(id)),
    })) }));
  } catch { /* Selling remains available. */ }
}

export default function ProductShortcuts(props: Props) {
  // Parent keys this component by business and store: drafts and fetches cannot cross branches.
  const { businessId, storeId, currency, products, onProductLoaded, onSelect, getAvailable, serverCatalogue = false, workspaceTab = 'cart', onWorkspaceTabChange, cartCount = 0 } = props;
  const cacheKey = `pos.shortcuts.v1.${businessId}.${storeId}`;
  const [layout, setLayout] = useState<ShortcutLayout>(EMPTY_SHORTCUT_LAYOUT);
  const [revision, setRevision] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  const [selected, setSelected] = useState('');
  const [draft, setDraft] = useState<ShortcutLayout | null>(null);
  const [confirmation, setConfirmation] = useState<'discard' | { id: string; name: string } | null>(null);
  const [missingName, setMissingName] = useState<string | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<SellableProductDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [removedDishIds, setRemovedDishIds] = useState<Set<string>>(new Set());
  const [validIds, setValidIds] = useState<Set<string> | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) setLayout(parseShortcutLayout(JSON.parse(cached)));
    } catch { /* Invalid or unavailable browser storage does not affect selling. */ }
    async function load() {
      try {
        const response = await fetch(`/api/pos/shortcuts?storeId=${encodeURIComponent(storeId)}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('load');
        const data = await response.json();
        const next = parseShortcutLayout(data.layout);
        if (!alive) return;
        data.products.forEach(onProductLoaded);
        const removed = new Set<string>(data.removedDishIds ?? []);
        setRemovedDishIds(removed);
        setValidIds(new Set(data.products.map((p: SellableProductDto) => p.id)));
        setLayout(next); setRevision(data.revision); setCanManage(data.canManage === true); setOffline(false); setReady(true); setMessage('');
        cacheVisibleShortcuts(cacheKey, next, removed);
      } catch {
        if (!alive || controller.signal.aborted) return;
        setReady(true); setCanManage(false); setOffline(!navigator.onLine);
        setMessage(navigator.onLine ? 'Shortcuts could not refresh. Reload to try again; scan and search remain available.' : 'Offline: saved shortcuts use the catalogue available on this device.');
      }
    }
    void load();
    const disconnected = () => { setOffline(true); setCanManage(false); setMessage('Offline: saved shortcuts use the catalogue available on this device.'); };
    const reconnected = () => { void load(); };
    window.addEventListener('offline', disconnected); window.addEventListener('online', reconnected);
    return () => { alive = false; controller.abort(); window.removeEventListener('offline', disconnected); window.removeEventListener('online', reconnected); };
  }, [cacheKey, storeId, onProductLoaded]);

  const editing = draft !== null;
  useEffect(() => {
    setMatches([]);
    if (!serverCatalogue || !editing || !query.trim() || offline) { setSearching(false); return; }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      void fetch(`/api/pos/search?${new URLSearchParams({ q: query.trim(), storeId, take: '12' })}`, { signal: controller.signal, cache: 'no-store' })
        .then(async response => { if (!response.ok) throw new Error('search'); return response.json(); })
        .then(data => { if (!controller.signal.aborted) { setMatches(data.products ?? []); (data.products ?? []).forEach(onProductLoaded); } })
        .catch(() => { if (!controller.signal.aborted) setMessage('Product search could not load. Try again.'); })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, editing, offline, storeId, onProductLoaded, serverCatalogue]);

  const searchMatches = serverCatalogue ? matches : products.filter(p => !removedDishIds.has(p.id) && `${p.name} ${p.sku ?? ''} ${p.barcode ?? ''} ${(p.additionalBarcodes ?? []).join(' ')} ${p.categoryName ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 12);
  const shown = draft ?? layout;
  const screen = shown.screens.find(s => s.id === selected) ?? shown.screens[0];
  const byId = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  function closeEditor() {
    setDraft(null);
    setQuery('');
    setMessage('');
    setConfirmation(null);
    setMissingName(null);
  }
  function requestClose() {
    if (busy || !draft) return;
    if (JSON.stringify(draft) === JSON.stringify(layout)) closeEditor();
    else setConfirmation('discard');
  }
  useEffect(() => {
    if (missingName && missingName === screen?.id) nameInput.current?.focus();
  }, [missingName, screen?.id]);
  useEffect(() => {
    if (confirmation) keepButton.current?.focus();
  }, [confirmation]);

  function updateScreen(update: Partial<{ name: string; productIds: string[] }>) {
    if (!screen || !draft) return;
    setDraft({ screens: draft.screens.map(s => s.id === screen.id ? { ...s, ...update } : s) });
  }
  function move(index: number, delta: number) {
    if (!screen) return;
    const ids = [...screen.productIds];
    [ids[index], ids[index + delta]] = [ids[index + delta]!, ids[index]!];
    updateScreen({ productIds: ids });
  }
  async function save() {
    if (!draft || busy) return;
    const unnamed = draft.screens.find(item => !item.name.trim());
    if (unnamed) {
      setSelected(unnamed.id);
      setMissingName(unnamed.id);
      if (unnamed.id === screen?.id) nameInput.current?.focus();
      return;
    }
    setBusy(true); setMessage('');
    try {
      const result = await savePosShortcutsAction(storeId, revision, draft);
      if (!result.success) { setMessage(result.error); return; }
      setLayout(result.data.layout); setRevision(result.data.revision); closeEditor();
      setValidIds(new Set(result.data.layout.screens.flatMap(s => s.productIds)));
      cacheVisibleShortcuts(cacheKey, result.data.layout, removedDishIds);
      setMessage('Shortcuts saved for this branch. Other tills receive them when they reload or reconnect.');
    } catch { setMessage('Shortcuts were not confirmed saved. Reconnect and reload before trying again.'); }
    finally { setBusy(false); }
  }

  const content = (
    <section aria-label="Product shortcuts" className="card pos-shortcuts min-w-0 p-3 sm:p-4" data-shortcut-view={draft ? 'editing' : workspaceTab} data-shortcut-collapsed={collapsed ? 'true' : 'false'}>
      {onWorkspaceTabChange && !draft ? <div className="mb-3 hidden gap-2 border-b border-slate-100 pb-3 lg:flex" aria-label="Selling workspace"><button type="button" className={workspaceTab === 'products' ? 'btn-primary' : 'btn-secondary'} aria-pressed={workspaceTab === 'products'} onClick={() => onWorkspaceTabChange('products')}>Products</button><button type="button" className={workspaceTab === 'cart' ? 'btn-primary' : 'btn-secondary'} aria-pressed={workspaceTab === 'cart'} onClick={() => onWorkspaceTabChange('cart')}>Cart · {cartCount}</button></div> : null}
      <div className="pos-shortcut-header flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Product shortcuts</h2>
        {!draft && onWorkspaceTabChange ? <div className="hidden items-center gap-3 lg:flex">{workspaceTab === 'cart' ? <button type="button" className="text-xs font-semibold text-slate-700" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>{collapsed ? 'Show shortcuts' : 'Hide shortcuts'}</button> : null}</div> : null}
        {canManage && !draft ? <button type="button" className="btn-secondary text-xs" onClick={() => { setDraft(structuredClone(layout)); setMessage(''); }}>Manage shortcuts</button> : null}
      </div>
      <p className="pos-shortcut-instruction mt-1 text-xs text-black/50">Tap a product to add one. Choose a selling unit when prompted.</p>
      {!ready ? <p role="status" className="mt-2 text-xs">Loading shortcuts…</p> : null}
      {message ? <p role="status" className="mt-2 text-xs text-black/60">{message}</p> : null}
      <div className="pos-shortcut-screens mt-3 flex max-h-28 flex-wrap gap-2 overflow-y-auto" aria-label="Shortcut screens">
        {!draft && onWorkspaceTabChange ? <label className="pos-shortcut-picker hidden text-xs font-semibold">Quick access <select className="input ml-2 w-auto max-w-full" aria-label="Quick access screen" value={screen?.id ?? ''} onChange={event => setSelected(event.target.value)}>{shown.screens.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label> : null}
        {shown.screens.map(s => <button type="button" key={s.id} disabled={busy} aria-pressed={s.id === screen?.id} className={`pos-shortcut-screen-button min-h-11 max-w-full break-words rounded-lg border px-3 text-sm ${s.id === screen?.id ? 'border-accent bg-accentSoft font-semibold' : 'border-black/10'}`} onClick={() => { setSelected(s.id); setQuery(''); }}>{s.name || layout.screens.find(saved => saved.id === s.id)?.name || `Screen ${shown.screens.indexOf(s) + 1}`}</button>)}
        {draft && shown.screens.length < 12 ? <button type="button" disabled={busy || offline} className="btn-secondary text-xs" onClick={() => { const id = crypto.randomUUID(); setDraft({ screens: [...shown.screens, { id, name: `Screen ${shown.screens.length + 1}`, productIds: [] }] }); setSelected(id); setQuery(''); }}>Add screen</button> : null}
      </div>
      {ready && !shown.screens.length && !draft ? <p className="mt-2 text-xs text-black/50">No shortcuts set up. An owner or manager can add screens for this branch.</p> : null}
      {draft ? <fieldset disabled={busy || offline} className="mt-3 space-y-3">
        {screen ? <>
          <label className="block text-xs font-semibold">Screen name
            <input ref={nameInput} className="input mt-1 text-base" maxLength={40} value={screen.name} placeholder="e.g. Drinks"
              aria-invalid={missingName === screen.id}
              aria-describedby={missingName === screen.id ? 'shortcut-screen-name-error' : undefined}
              onChange={event => {
                updateScreen({ name: event.target.value });
                if (event.target.value.trim() && missingName === screen.id) setMissingName(null);
              }} />
          </label>
          {missingName === screen.id ? <p id="shortcut-screen-name-error" role="alert" className="text-sm text-red-700">Give this screen a name</p> : null}
          <label className="block text-xs font-semibold">Find products for this screen<input type="search" className="input mt-1" placeholder="Name, code or barcode…" value={query} onChange={e => setQuery(e.target.value)} /></label>
          {query.trim() ? <div className="max-h-52 overflow-y-auto rounded-lg border border-black/10 p-2">
            {searching ? <p role="status" className="text-xs">Searching…</p> : !searchMatches.length ? <p className="text-xs">No matching products.</p> : null}
            {searchMatches.map(p => <button type="button" key={p.id} disabled={screen.productIds.includes(p.id) || screen.productIds.length >= 40} className="flex min-h-11 w-full items-center justify-between gap-2 border-b border-black/5 px-2 text-left text-sm disabled:opacity-40" onClick={() => updateScreen({ productIds: [...screen.productIds, p.id] })}><span className="min-w-0 break-words">{p.name} <span className="text-xs text-black/50">{p.sku ?? p.barcode}</span></span><span>{screen.productIds.includes(p.id) ? 'Added' : 'Add'}</span></button>)}
          </div> : null}
          <p className="text-xs text-black/50">{screen.productIds.length} of 40 buttons. Move up or down to set the order.</p>
          <ol className="max-h-64 space-y-2 overflow-y-auto">
            {screen.productIds.map((id, index) => <li key={id} className="flex flex-wrap items-center gap-2 rounded-lg border border-black/10 p-2 text-sm"><span className="min-w-0 flex-1 break-words">{removedDishIds.has(id) ? 'Removed from menu' : byId.get(id)?.name ?? 'Unavailable product — remove before saving'}</span><button type="button" className="min-h-11 px-2 disabled:opacity-30" disabled={index === 0} aria-label={`Move ${byId.get(id)?.name ?? 'product'} up`} onClick={() => move(index, -1)}>↑</button><button type="button" className="min-h-11 px-2 disabled:opacity-30" disabled={index === screen.productIds.length - 1} aria-label={`Move ${byId.get(id)?.name ?? 'product'} down`} onClick={() => move(index, 1)}>↓</button><button type="button" className="min-h-11 px-2 text-red-700" aria-label={`Remove ${byId.get(id)?.name ?? 'product'}`} onClick={() => updateScreen({ productIds: screen.productIds.filter(p => p !== id) })}>Remove</button></li>)}
          </ol>
          <div className="border-t border-slate-200 pt-3">
            <button type="button" className="min-h-11 text-sm text-red-700 underline"
              onClick={() => setConfirmation({ id: screen.id, name: screen.name.trim() || layout.screens.find(saved => saved.id === screen.id)?.name || `Screen ${shown.screens.indexOf(screen) + 1}` })}>Remove screen</button>
          </div>
        </> : <p className="text-xs">Add a screen, then search for its products.</p>}
      </fieldset> : <div className="pos-shortcut-tiles mt-3 grid max-h-80 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
        {screen?.productIds.filter(id => !removedDishIds.has(id)).map(id => {
          const product = byId.get(id);
          const unavailable = !product || (validIds !== null && !validIds.has(id));
          const available = unavailable ? 0 : getAvailable(id);
          const tile = <button key={id} type="button" disabled={!ready || unavailable || available <= 0} className="pos-shortcut-tile min-h-20 min-w-0 rounded-xl border border-black/10 p-3 text-left transition hover:bg-accentSoft disabled:opacity-45" onClick={() => { if (product) onSelect(product); }}><span className="block break-words text-sm font-semibold">{product?.name ?? 'Unavailable product'}</span><span className="mt-1 block text-xs text-black/50">{unavailable ? 'Unavailable' : available <= 0 ? (!isDishAvailableToday(product?.food) ? 'Not today' : product?.food ? 'Sold out' : 'Out of stock') : formatDishListPrice(product?.food, product?.sellingPriceBasePence ?? 0, (pence) => formatMoney(pence, currency))}</span></button>;
          if (!ready || unavailable || available > 0 || !product?.food || !props.canManageDishes) return tile;
          return <div key={id} className="flex min-w-0 flex-col gap-1">
            {tile}
            <Link className="inline-flex min-h-11 items-center px-3 text-xs font-semibold text-accent underline"
              href={dishSettingsHref(id)} aria-label={`Manage dish: ${product.name}`}>Manage dish</Link>
          </div>;
        })}
        {screen && !screen.productIds.some(id => !removedDishIds.has(id)) ? <p className="col-span-full text-xs text-black/50">No products on this screen yet.</p> : null}
      </div>}
    </section>
  );
  const footer = confirmation ? (
    <div className="space-y-2" role="group" aria-labelledby="shortcut-confirmation">
      <p id="shortcut-confirmation" className="text-sm font-semibold">
        {confirmation === 'discard' ? 'Discard your changes?' : `Remove the screen '${confirmation.name}' and its buttons?`}
      </p>
      <div className="flex flex-wrap gap-2">
        <button ref={keepButton} type="button" className="btn-primary" onClick={() => setConfirmation(null)}>
          {confirmation === 'discard' ? 'Keep editing' : 'Keep'}
        </button>
        <button type="button" className="btn-secondary border-red-200 text-red-700" onClick={() => {
          if (confirmation === 'discard') {
            closeEditor();
          } else {
            setDraft(current => current && ({ screens: current.screens.filter(item => item.id !== confirmation.id) }));
            setConfirmation(null);
            setQuery('');
            if (missingName === confirmation.id) setMissingName(null);
          }
        }}>{confirmation === 'discard' ? 'Discard' : 'Remove'}</button>
      </div>
    </div>
  ) : (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn-primary" disabled={busy || offline} onClick={() => void save()}>
        {busy ? 'Saving…' : 'Save shortcuts'}
      </button>
      <button type="button" className="btn-secondary" disabled={busy} onClick={requestClose}>Cancel</button>
    </div>
  );

  return draft ? (
    <ResponsiveModal open onClose={requestClose} ariaLabel="Manage product shortcuts" closeOnBackdrop={false}
      closeOnEscape={!busy} maxWidthClassName="max-w-3xl" fitVisualViewport footer={footer}>
      <fieldset disabled={Boolean(confirmation)}>{content}</fieldset>
    </ResponsiveModal>
  ) : content;
}
