'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- Catalogue query navigation deliberately uses a full server render; report links still use App Router. */

import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import { classificationSaveFailure } from '@/lib/products/classification-save-failure';
import { saveClassificationSetupAction } from '@/app/actions/product-classification';
import type { ClassificationDivision } from './ProductCategoryField';
import ClassificationList from './ClassificationList';

type Category = { id: string; name: string };
type Kind = 'category' | 'division' | 'group';
const titles = { category: 'Category', division: 'Division', group: 'Group' };

export default function ClassificationSetup({ categories, divisions, initialCategoryId, initialDivisionId, initialGroupId, initialAdd, saved }: {
  categories: Category[]; divisions: ClassificationDivision[]; initialCategoryId?: string; initialDivisionId?: string; initialGroupId?: string; initialAdd?: string; saved?: string;
}) {
  const id = useId();
  const nameInput = useRef<HTMLInputElement>(null);
  const [createdCategories, setCreatedCategories] = useState<Category[]>([]);
  const [createdDivisions, setCreatedDivisions] = useState<ClassificationDivision[]>([]);
  const [createdGroups, setCreatedGroups] = useState<{ id: string; name: string; divisionId: string }[]>([]);
  const availableCategories = [...categories, ...createdCategories.filter(c => !categories.some(row => row.id === c.id))];
  const availableDivisions = [...divisions, ...createdDivisions.filter(d => !divisions.some(row => row.id === d.id))].map(d => ({ ...d,
    groups: [...d.groups, ...createdGroups.filter(g => g.divisionId === d.id && !d.groups.some(row => row.id === g.id))],
  }));
  const firstCategory = categories.find(c => c.id === initialCategoryId) ?? categories.find(c => divisions.some(d => d.categoryId === c.id)) ?? categories[0];
  const firstDivision = divisions.find(d => d.id === initialDivisionId && d.categoryId === firstCategory?.id) ?? divisions.find(d => d.categoryId === firstCategory?.id);
  const [categoryId, setCategoryId] = useState(firstCategory?.id ?? '');
  const [divisionId, setDivisionId] = useState(firstDivision?.id ?? '');
  const [groupId, setGroupId] = useState(firstDivision?.groups.find(g => g.id === initialGroupId)?.id ?? '');
  const [kind, setKind] = useState<Kind | null>(initialAdd === 'category' || (initialAdd === 'division' && firstCategory) || (initialAdd === 'group' && firstDivision) ? initialAdd as Kind : null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = saving;
  const savingRef = useRef(false);
  const [message, setMessage] = useState(saved === 'category' && firstCategory ? 'Category saved. Add a division here, or use this category on its own.' : saved === 'division' && firstDivision ? 'Division saved. Next, add a group under this division.' : saved === 'group' && firstDivision?.groups.some(g => g.id === initialGroupId) ? 'Group saved. Choose this group for a product; its division and category follow automatically.' : '');
  const [error, setError] = useState('');
  const category = availableCategories.find(c => c.id === categoryId);
  const children = availableDivisions.filter(d => d.categoryId === category?.id);
  const division = children.find(d => d.id === divisionId);
  const group = division?.groups.find(g => g.id === groupId);
  const path = [category?.name, division?.name, group?.name].filter(Boolean).join(' → ');
  const browse = (scope: 'category' | 'division' | 'group') => `/products?${new URLSearchParams({ tab: 'products',
    ...(category ? { category: category.id } : {}),
    ...(scope !== 'category' && division ? { division: division.id } : {}),
    ...(scope === 'group' && group ? { group: group.id } : {}),
  })}`;

  function open(next: Kind) { setKind(next); setName(''); setError(''); setMessage(''); }
  function chooseCategory(value: string) {
    setCategoryId(value); setDivisionId(availableDivisions.find(d => d.categoryId === value)?.id ?? '');
    setGroupId(''); setKind(null); setName(''); setError(''); setMessage('');
  }
  function chooseDivision(value: string) { setDivisionId(value); setGroupId(''); setKind(null); setName(''); setError(''); setMessage(''); }
  function editor(forKind: Kind) {
    if (kind !== forKind) return null;
    const parentId = forKind === 'division' ? category?.id : division?.id;
    return <form aria-label={`Add ${forKind}`} className="space-y-3 rounded-xl border border-accent/20 bg-white p-3" onSubmit={async event => {
      event.preventDefault(); if (savingRef.current || !name.trim() || (forKind !== 'category' && !parentId)) return;
      savingRef.current = true; setSaving(true); setError(''); setMessage('');
        try {
          const result = await saveClassificationSetupAction(forKind, parentId ?? '', name);
          if (!result) return; // Successful saves navigate to the persisted parent and next step.
          if (!result.success) { setError(result.error); return; }
          if (result.redirectTo) { window.location.assign(result.redirectTo); return; }
          if (forKind === 'category') {
            setCreatedCategories(rows => [...rows.filter(row => row.id !== result.data.id), result.data]);
            setCategoryId(result.data.id); setDivisionId(''); setGroupId(''); setKind('division');
            setMessage(`Category “${result.data.name}” saved. Next, add a division here, or use this category on its own.`);
          } else if (forKind === 'division') {
            setCreatedDivisions(rows => [...rows.filter(row => row.id !== result.data.id), { ...result.data, categoryId: parentId!, groups: [] }]);
            setDivisionId(result.data.id); setGroupId(''); setKind('group');
            setMessage(`Division “${result.data.name}” saved. Next, add a group under this division.`);
          } else {
            setCreatedGroups(rows => [...rows.filter(row => row.id !== result.data.id), { ...result.data, divisionId: parentId! }]);
            setGroupId(result.data.id); setKind(null);
            setMessage(`Group “${result.data.name}” saved. Choose this group when adding or editing a product; its division and category follow automatically.`);
          }
          setName(''); nameInput.current?.focus();
        } catch (failure) { setError(classificationSaveFailure(failure)); }
        finally { savingRef.current = false; setSaving(false); }
    }}>
      <label className="block text-sm font-medium" htmlFor={`${id}-${forKind}-name`}>{titles[forKind]} name</label>
      <input ref={nameInput} id={`${id}-${forKind}-name`} className="input" autoFocus required maxLength={100} value={name} disabled={busy} onChange={event => setName(event.target.value)} />
      <div className="flex flex-wrap gap-2"><button className="btn-primary text-sm" disabled={busy || !name.trim()}>{busy ? 'Saving…' : `Save ${forKind}`}</button><button type="button" className="btn-secondary text-sm" disabled={busy} onClick={() => setKind(null)}>Cancel</button></div>
    </form>;
  }

  return <section aria-label="Classification setup" className="card space-y-4 p-4 sm:p-5" aria-busy={busy}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Classification</h2>
      <p className="mt-1 text-sm text-ink/65">Category → Division → Group. Select a category to see its divisions, then a division to see its groups.</p></div>
      <Link href="/reports/analytics#classification-performance" className="text-sm font-semibold text-accent underline">View classification performance</Link></div>
    <p className="rounded-xl bg-slate-50 p-3 text-sm text-ink/75">Products can use a category on its own. When you choose a group for a product, its division and category are filled automatically.</p>
    <div className="grid min-w-0 gap-4 lg:grid-cols-3">
      <section aria-label="Categories" className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">1. Category <span className="text-sm font-normal text-ink/60">({availableCategories.length})</span></h3><button type="button" className="btn-secondary text-xs" disabled={busy} onClick={() => open('category')}>Add category</button></div>
        <p className="text-xs text-ink/60">The broadest level of your catalogue.</p>
        {editor('category')}
        <ClassificationList items={availableCategories} selectedId={category?.id} label="Categories" disabled={busy} onSelect={chooseCategory} />
        {!availableCategories.length && <p className="text-sm text-ink/60">No categories yet. Add your first category above.</p>}
      </section>
      <section aria-label="Divisions" className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">2. Division <span className="text-sm font-normal text-ink/60">({children.length})</span></h3><button type="button" className="btn-secondary text-xs" disabled={busy || !category} onClick={() => open('division')}>Add division</button></div>
        <p className="break-words text-xs text-ink/60">{category ? `Under category: ${category.name}` : 'Select a category first.'}</p>
        {editor('division')}
        <ClassificationList key={category?.id ?? 'no-category'} items={children} selectedId={division?.id} label="Divisions" disabled={busy} onSelect={chooseDivision} />
        {category && !children.length && <p className="text-sm text-ink/60">No divisions in this category yet. Add a division, or keep using the category on its own.</p>}
      </section>
      <section aria-label="Groups" className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">3. Group <span className="text-sm font-normal text-ink/60">({division?.groups.length ?? 0})</span></h3><button type="button" className="btn-secondary text-xs" disabled={busy || !division} onClick={() => open('group')}>Add group</button></div>
        <p className="break-words text-xs text-ink/60">{division ? `Under division: ${division.name}` : 'Select a division first.'}</p>
        {editor('group')}
        <ClassificationList key={division?.id ?? 'no-division'} items={division?.groups ?? []} selectedId={group?.id} label="Groups" disabled={busy} onSelect={value => { setGroupId(value); setKind(null); setError(''); setMessage(''); }} />
        {division && !division.groups.length && <p className="text-sm text-ink/60">No groups in this division yet. Add a group above.</p>}
      </section>
    </div>
    {category && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/15 bg-accentSoft/30 p-3"><div className="min-w-0"><p className="text-xs font-semibold text-ink/60">Selected classification</p><p className="break-words text-sm font-semibold [overflow-wrap:anywhere]">{path}</p></div>
      <a className="btn-secondary text-sm" href={browse(group ? 'group' : division ? 'division' : 'category')}>View products in this {group ? 'group' : division ? 'division' : 'category'}</a></div>}
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
  </section>;
}
