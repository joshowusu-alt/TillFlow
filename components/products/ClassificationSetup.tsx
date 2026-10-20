'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClassificationNodeAction } from '@/app/actions/product-classification';
import type { ClassificationDivision } from './ProductCategoryField';

export default function ClassificationSetup({ categories, divisions }: {
  categories: { id: string; name: string }[]; divisions: ClassificationDivision[];
}) {
  const id = useId();
  const router = useRouter();
  const [kind, setKind] = useState<'division' | 'group'>('division');
  const [parentId, setParentId] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const parents = kind === 'division' ? categories : divisions.map(division => ({ id: division.id,
    name: `${categories.find(category => category.id === division.categoryId)?.name ?? ''} / ${division.name}`,
  }));

  return <section className="card space-y-4 p-4 sm:p-5">
    <h2 className="text-lg font-semibold">Divisions and groups (optional)</h2>
    <p className="text-sm text-black/60">Categories work on their own. Add divisions under a category and groups under each division when you need more detail.</p>
    <form className="grid gap-3 sm:grid-cols-3" onSubmit={async event => {
      event.preventDefault(); if (busy) return; setBusy(true); setError(''); setMessage('');
      try {
        const result = await createClassificationNodeAction(kind, parentId, name);
        if (!result.success) { setError(result.error); return; }
        setMessage(`${kind === 'division' ? 'Division' : 'Group'} saved.`); setName(''); router.refresh();
      } catch { setError('Could not save. Please try again.'); }
      finally { setBusy(false); }
    }}>
      <div><label className="label" htmlFor={`${id}-kind`}>Add</label><select id={`${id}-kind`} className="input" value={kind} disabled={busy} onChange={event => { setKind(event.target.value as 'division' | 'group'); setParentId(''); }}><option value="division">Division</option><option value="group">Group</option></select></div>
      <div><label className="label" htmlFor={`${id}-parent`}>{kind === 'division' ? 'Under category' : 'Under division'}</label><select id={`${id}-parent`} className="input" required value={parentId} disabled={busy} onChange={event => setParentId(event.target.value)}><option value="">Choose…</option>{parents.map(parent => <option key={parent.id} value={parent.id}>{parent.name}</option>)}</select></div>
      <div><label className="label" htmlFor={`${id}-name`}>Name</label><input id={`${id}-name`} className="input" required maxLength={100} value={name} disabled={busy} onChange={event => setName(event.target.value)} /></div>
      <button className="btn-primary w-fit" disabled={busy || !parentId || !name.trim()}>{busy ? 'Saving…' : `Add ${kind}`}</button>
    </form>
    {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
    {message ? <p role="status" className="text-sm text-emerald-700">{message}</p> : null}
    {divisions.length ? <ul className="space-y-3 text-sm">{categories.map(category => {
      const children = divisions.filter(division => division.categoryId === category.id);
      return children.length ? <li key={category.id}><strong>{category.name}</strong><ul className="ml-4 mt-1 space-y-2">{children.map(division => <li key={division.id}>{division.name}<p className="text-xs text-black/55">{division.groups.length ? division.groups.map(group => group.name).join(' · ') : 'No groups yet'}</p></li>)}</ul></li> : null;
    })}</ul> : null}
  </section>;
}
