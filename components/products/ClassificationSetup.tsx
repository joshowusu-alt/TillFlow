'use client';

import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClassificationNodeAction } from '@/app/actions/product-classification';
import type { ClassificationDivision } from './ProductCategoryField';

export default function ClassificationSetup({ categories, divisions }: {
  categories: { id: string; name: string }[]; divisions: ClassificationDivision[];
}) {
  const id = useId();
  const router = useRouter();
  const nameInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<'division' | 'group'>('division');
  const [parentId, setParentId] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [createdDivisions, setCreatedDivisions] = useState<ClassificationDivision[]>([]);
  const availableDivisions = [...divisions, ...createdDivisions.filter(created => !divisions.some(division => division.id === created.id))];
  const parents = kind === 'division' ? categories : availableDivisions.map(division => ({ id: division.id,
    name: `${categories.find(category => category.id === division.categoryId)?.name ?? ''} / ${division.name}`,
  }));

  return <section className="card space-y-4 p-4 sm:p-5">
    <h2 className="text-lg font-semibold">Divisions and groups (optional)</h2>
    <p className="text-sm text-black/60">Categories work on their own. Add divisions under a category and groups under each division when you need more detail.</p>
    <ol className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
      <li><strong>1. Add a division</strong><p className="mt-1 text-black/60">Choose an existing category, then name the division beneath it.</p></li>
      <li><strong>2. Add a group</strong><p className="mt-1 text-black/60">Choose a division, then name the group that products will use.</p></li>
      <li><strong>3. Assign products</strong><p className="mt-1 text-black/60">Open a product and choose its group. The category and division follow automatically.</p></li>
    </ol>
    <form className="grid gap-3 sm:grid-cols-3" onSubmit={async event => {
      event.preventDefault(); if (busy) return; setBusy(true); setError(''); setMessage('');
      try {
        const result = await createClassificationNodeAction(kind, parentId, name);
        if (!result.success) { setError(result.error); return; }
        if (kind === 'division') {
          setCreatedDivisions(current => [...current.filter(division => division.id !== result.data.id), { id: result.data.id, name: result.data.name, categoryId: parentId, groups: [] }]);
          setMessage(`Division “${result.data.name}” saved. Next, add a group under this division.`);
          setKind('group'); setParentId(result.data.id);
        } else {
          setMessage(`Group “${result.data.name}” saved. Open a product and choose this group under “Division and group (optional)”.`);
        }
        setName(''); router.refresh(); nameInput.current?.focus();
      } catch { setError('Could not save. Please try again.'); }
      finally { setBusy(false); }
    }}>
      <div><label className="label" htmlFor={`${id}-kind`}>Add</label><select id={`${id}-kind`} className="input" value={kind} disabled={busy} onChange={event => { setKind(event.target.value as 'division' | 'group'); setParentId(''); }}><option value="division">Division</option><option value="group">Group</option></select></div>
      <div><label className="label" htmlFor={`${id}-parent`}>{kind === 'division' ? 'Under category' : 'Under division'}</label><select id={`${id}-parent`} className="input" required value={parentId} disabled={busy} onChange={event => setParentId(event.target.value)}><option value="">Choose…</option>{parents.map(parent => <option key={parent.id} value={parent.id}>{parent.name}</option>)}</select></div>
      <div><label className="label" htmlFor={`${id}-name`}>{kind === 'division' ? 'Division name' : 'Group name'}</label><input ref={nameInput} id={`${id}-name`} className="input" required maxLength={100} value={name} disabled={busy} onChange={event => setName(event.target.value)} /></div>
      <button className="btn-primary w-fit" disabled={busy || !parentId || !name.trim()}>{busy ? 'Saving…' : `Add ${kind}`}</button>
    </form>
    {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
    {message ? <p role="status" className="text-sm text-emerald-700">{message} {kind === 'group' ? <Link href="/products?tab=products" className="font-semibold underline">Go to products</Link> : null}</p> : null}
    {availableDivisions.length ? <ul className="space-y-3 text-sm">{categories.map(category => {
      const children = availableDivisions.filter(division => division.categoryId === category.id);
      return children.length ? <li key={category.id} className="rounded-xl border border-slate-200 p-3"><strong>Category: {category.name}</strong><ul className="ml-4 mt-2 space-y-3">{children.map(division => <li key={division.id}><div className="flex flex-wrap items-center justify-between gap-2"><span>Division: <strong>{division.name}</strong></span><button type="button" className="btn-secondary text-xs" disabled={busy} onClick={() => { setKind('group'); setParentId(division.id); setName(''); setError(''); setMessage(''); nameInput.current?.focus(); }}>Add group under {division.name}</button></div><p className="mt-1 text-xs text-black/55">{division.groups.length ? `Groups: ${division.groups.map(group => group.name).join(' · ')}` : 'No groups yet. Add a group here before assigning products to this division.'}</p></li>)}</ul></li> : null;
    })}</ul> : null}
  </section>;
}
