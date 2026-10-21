'use client';

import { useId, useState } from 'react';

type Item = { id: string; name: string };
const INITIAL_VISIBLE = 5;
const MORE_VISIBLE = 20;
const normalise = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

/** Bound the rendered choices even when a classification contains thousands of names. */
export default function ClassificationList({ items, selectedId, label, disabled, onSelect }: {
  items: Item[]; selectedId?: string; label: string; disabled?: boolean; onSelect: (id: string) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(INITIAL_VISIBLE);
  const selected = items.find(item => item.id === selectedId);
  const search = normalise(query);
  const matches = search ? items.filter(item => normalise(item.name).includes(search)) : items;
  const selectedMatch = matches.find(item => item.id === selectedId);
  const ordered = selectedMatch ? [selectedMatch, ...matches.filter(item => item.id !== selectedId)] : matches;
  const visible = ordered.slice(0, limit);
  function changeQuery(value: string) { setQuery(value); setLimit(INITIAL_VISIBLE); }

  return <div className="min-w-0 space-y-2">
    {selected && <p className="break-words text-xs text-ink/70 [overflow-wrap:anywhere]">Selected: <strong>{selected.name}</strong></p>}
    <label htmlFor={id} className="block text-xs font-semibold text-ink/70">Search {label.toLowerCase()}</label>
    <input id={id} type="search" className="input w-full" placeholder={`Type to find ${label.toLowerCase()}…`} value={query}
      disabled={disabled || items.length === 0} onChange={event => changeQuery(event.target.value)} aria-controls={`${id}-results`} />
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink/60">
      <p aria-live="polite">Showing {visible.length} of {matches.length}{search ? ' matches' : ` ${label.toLowerCase()}`}</p>
      {query && <button type="button" disabled={disabled} className="min-h-[32px] font-semibold text-accent underline" onClick={() => changeQuery('')}>Clear search</button>}
    </div>
    <ul id={`${id}-results`} className="max-h-64 space-y-2 overflow-y-auto overscroll-contain" aria-label={`${label} choices`}>
      {visible.map(item => <li key={item.id}><button type="button" disabled={disabled} aria-pressed={item.id === selectedId}
        onClick={() => { if (item.id !== selectedId) onSelect(item.id); }}
        className={`min-h-[44px] w-full break-words rounded-lg border px-3 py-2 text-left text-sm [overflow-wrap:anywhere] ${item.id === selectedId ? 'border-accent bg-accentSoft font-semibold text-accent' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
        {item.name}
      </button></li>)}
    </ul>
    {items.length > 0 && !visible.length && <p className="text-sm text-ink/60">No matching {label.toLowerCase()}. Try another name or clear the search.</p>}
    {(matches.length > limit || limit > INITIAL_VISIBLE) && <div className="flex flex-wrap gap-2">
      {matches.length > limit && <button type="button" disabled={disabled} className="btn-secondary text-xs" onClick={() => setLimit(value => value + MORE_VISIBLE)}>Show more ({matches.length - visible.length} remaining)</button>}
      {limit > INITIAL_VISIBLE && <button type="button" disabled={disabled} className="btn-secondary text-xs" onClick={() => setLimit(INITIAL_VISIBLE)}>Show fewer</button>}
    </div>}
  </div>;
}
