'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { catalogueCount, catalogueHref, catalogueSelection, type CatalogueCategory, type CatalogueDivision,
  type CatalogueCount, type CatalogueSelection } from '@/lib/products/catalogue-classification';

type Props = {
  categories: CatalogueCategory[]; divisions: CatalogueDivision[]; counts: CatalogueCount[];
  selection: CatalogueSelection; context: Record<string, string | undefined>;
};
type Level = 'category' | 'division' | 'group';
const labels = { category: 'Category', division: 'Division', group: 'Group' };
const plurals = { category: 'categories', division: 'divisions', group: 'groups' };
const normalise = (text: string) => text.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const INITIAL_LIMIT = 20;

export default function CatalogueClassificationNav(props: Props) {
  // URL selection remains authoritative, including browser back/forward navigation.
  return <ClassificationFilters key={JSON.stringify(props.selection)} {...props} />;
}

function ClassificationFilters({ categories, divisions, counts, selection, context }: Props) {
  const id = useId();
  const [open, setOpen] = useState<Level | null>(null);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(INITIAL_LIMIT);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) searchInput.current?.focus(); }, [open]);
  const triggers = useRef<Partial<Record<Level, HTMLButtonElement | null>>>({});
  const current = catalogueSelection(categories, divisions, selection);
  const categoryId = current.category?.id;
  const children = divisions.filter(d => d.categoryId === categoryId);
  const total = (scope: CatalogueSelection) => catalogueCount(counts, divisions, scope);
  const hasSelection = !!(selection.category || selection.division || selection.group);
  const levels: { level: Level; value: string; disabled: boolean }[] = [
    { level: 'category', value: current.category?.name ?? 'All categories', disabled: categories.length === 0 },
    { level: 'division', value: current.division?.name ?? (categoryId ? children.length ? 'All divisions' : 'No divisions set up' : 'Choose a category first'), disabled: !current.valid || !categoryId || !children.length },
    { level: 'group', value: current.group?.name ?? (current.division ? current.division.groups.length ? 'All groups' : 'No groups set up' : 'Choose a division first'), disabled: !current.valid || !current.division?.groups.length },
  ];
  const options: { name: string; scope: CatalogueSelection }[] = open === 'category' ? categories.map(c => ({ name: c.name, scope: { category: c.id } }))
    : open === 'division' ? children.map(d => ({ name: d.name, scope: { category: categoryId, division: d.id } }))
    : open === 'group' ? (current.division?.groups ?? []).map(g => ({ name: g.name, scope: { category: categoryId, division: current.division?.id, group: g.id } })) : [];
  const search = normalise(query);
  const matches = options.filter(option => !search || normalise(option.name).includes(search));
  const selectedId = open ? current[open]?.id : undefined;
  const ordered = [...matches.filter(option => open && option.scope[open] === selectedId), ...matches.filter(option => !open || option.scope[open] !== selectedId)];
  const resetScope = open === 'category' ? {} : open === 'division' ? { category: categoryId } : { category: categoryId, division: current.division?.id };
  const path = [current.category?.name, current.division?.name, current.group?.name].filter(Boolean).join(' → ');

  function toggle(level: Level) { setOpen(previous => previous === level ? null : level); setQuery(''); setLimit(INITIAL_LIMIT); }
  function close() { if (open) triggers.current[open]?.focus(); setOpen(null); }

  return <nav aria-label="Browse catalogue classification" className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4"
    onKeyDown={event => { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-semibold text-ink">Filter by classification</h2>
      {current.valid && <span className="text-xs text-ink/65">{total(selection).toLocaleString()} products{context.q ? ' within this search' : context.issue || context.missingCost ? ' within this review' : ''}</span>}
    </div>
    <div className="grid min-w-0 gap-3 sm:grid-cols-3">
      {levels.map(({ level, value, disabled }) => <div key={level} className="min-w-0">
        <span id={`${id}-${level}-label`} className="mb-1.5 block text-xs font-semibold text-ink/65">{labels[level]}</span>
        <button ref={node => { triggers.current[level] = node; }} type="button" disabled={disabled}
          aria-labelledby={`${id}-${level}-label ${id}-${level}-value`} aria-expanded={open === level} aria-controls={`${id}-${level}-panel`}
          onClick={() => toggle(level)} className={`flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${open === level ? 'border-accent ring-1 ring-accent' : 'border-slate-200'}`}>
          <span id={`${id}-${level}-value`} className="truncate" title={value}>{value}</span>
          <svg aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${open === level ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m5 7.5 5 5 5-5" /></svg>
        </button>
      </div>)}
    </div>
    {open && <section id={`${id}-${open}-panel`} aria-label={`Choose ${labels[open].toLowerCase()}`} className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3"><label htmlFor={`${id}-search`} className="text-xs font-semibold text-ink/70">Search {plurals[open]}</label><button type="button" onClick={close} className="min-h-8 text-xs font-semibold text-accent underline">Close</button></div>
      <input ref={searchInput} id={`${id}-search`} type="search" className="input w-full" placeholder={`Find ${plurals[open]}…`} value={query} aria-controls={`${id}-choices`}
        onChange={event => { setQuery(event.target.value); setLimit(INITIAL_LIMIT); }} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink/65">
        <p aria-live="polite">Showing {Math.min(limit, matches.length)} of {matches.length} {search ? 'matches' : plurals[open]}</p>
        <Link href={catalogueHref(context, resetScope)} scroll={false} onClick={() => setOpen(null)} className="min-h-8 py-1.5 font-semibold text-accent underline">{open === 'category' ? 'All categories' : open === 'division' ? 'All divisions' : 'All groups'}</Link>
      </div>
      <ul id={`${id}-choices`} aria-label={`${labels[open]} choices`} className="grid max-h-60 min-w-0 grid-cols-1 gap-2 overflow-y-auto overscroll-contain sm:grid-cols-2 lg:grid-cols-3">
        {ordered.slice(0, limit).map(option => <li key={catalogueHref({}, option.scope)} className="min-w-0"><Link href={catalogueHref(context, option.scope)} scroll={false} onClick={() => setOpen(null)}
          aria-current={open && option.scope[open] === selectedId && current.valid ? 'page' : undefined}
          className={`flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${open && option.scope[open] === selectedId && current.valid ? 'border-accent bg-accentSoft font-semibold text-accent' : 'border-slate-200 hover:bg-slate-50'}`}>
          <span className="break-words [overflow-wrap:anywhere]">{option.name}</span><span className="shrink-0 text-xs tabular-nums text-ink/65" aria-label={`${total(option.scope)} products`}>{total(option.scope).toLocaleString()}</span>
        </Link></li>)}
      </ul>
      {!matches.length && <p className="text-sm text-ink/65">No matching {plurals[open]}. Try another name.</p>}
      {matches.length > limit && <button type="button" className="btn-secondary text-xs" onClick={() => setLimit(value => value + INITIAL_LIMIT)}>Show more {plurals[open]} ({matches.length - limit} remaining)</button>}
    </section>}
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2 text-xs text-ink/65">
      <p className="min-w-0 break-words [overflow-wrap:anywhere]" aria-live="polite">{current.valid ? path || 'Browse all products, or choose a classification above.'
        : 'This classification combination is unavailable.'}</p>
      {hasSelection && <Link href={catalogueHref(context, {})} scroll={false} className="min-h-8 py-1.5 font-semibold text-accent underline">Clear classification filters</Link>}
    </div>
    {current.valid && categoryId && !children.length && <p className="text-xs text-ink/65">Category-only products · no divisions set up</p>}
  </nav>;
}
