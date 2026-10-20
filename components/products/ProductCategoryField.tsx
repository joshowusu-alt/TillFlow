'use client';
import { useId, useState } from 'react';
import { quickCreateCategoryAction } from '@/app/actions/categories';
export type ClassificationDivision = {id:string;name:string;categoryId:string;groups:{id:string;name:string}[]};
export default function ProductCategoryField({categories,divisions=[],defaultValue='',defaultGroupId=''}:{categories:{id:string;name:string}[];divisions?:ClassificationDivision[];defaultValue?:string;defaultGroupId?:string}) {
  const id=useId();
  const [groupId,setGroupId]=useState(defaultGroupId),[search,setSearch]=useState('');
  const groups=divisions.flatMap(division=>division.groups.map(group=>({...group,categoryId:division.categoryId,path:`${categories.find(category=>category.id===division.categoryId)?.name ?? ''} / ${division.name} / ${group.name}`})));
  const selected=groups.find(group=>group.id===groupId);
  const [options,setOptions]=useState(categories), [value,setValue]=useState(defaultValue), [adding,setAdding]=useState(false), [name,setName]=useState(''), [busy,setBusy]=useState(false), [error,setError]=useState('');
  async function save(){if(busy)return;setBusy(true);setError('');try{const result=await quickCreateCategoryAction(name);if(!result.success){setError(result.error);return;}setOptions(current=>current.some(item=>item.id===result.data.id)?current:[...current,result.data]);setValue(result.data.id);setGroupId('');setAdding(false);setName('');}catch{setError('Could not add this category. Please try again.');}finally{setBusy(false);}}
  return <div className="space-y-2">
    <label className="label" htmlFor={`${id}-category`}>Category</label><select id={`${id}-category`} className="input" name="categoryId" value={selected?.categoryId ?? value} onChange={e=>{setValue(e.target.value);setGroupId('');}}><option value="">Uncategorised</option>{options.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
    {groups.length ? <details open={Boolean(groupId)}><summary className="cursor-pointer text-xs font-semibold text-accent">Division and group (optional)</summary><div className="mt-2 space-y-2">
      <label className="label" htmlFor={`${id}-search`}>Find a group</label><input id={`${id}-search`} className="input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search category, division or group" />
      <label className="label" htmlFor={`${id}-group`}>Group</label><select id={`${id}-group`} className="input" name="groupId" value={groupId} onChange={e=>{const next=groups.find(group=>group.id===e.target.value);setGroupId(e.target.value);if(next)setValue(next.categoryId);}}><option value="">Use category only</option>{groups.filter(group=>group.id===groupId || group.path.toLowerCase().includes(search.toLowerCase())).map(group=><option key={group.id} value={group.id}>{group.path}</option>)}</select><p className="text-xs text-black/55">Choose a group once. Its division and category are filled automatically.</p>
    </div></details> : <input type="hidden" name="groupId" value="" />}
    {adding?<div className="mt-2 space-y-2"><input className="input" aria-label="New category name" value={name} maxLength={100} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void save();}}} /><div className="flex gap-2"><button className="btn-secondary" type="button" disabled={busy||!name.trim()} onClick={()=>void save()}>{busy?'Adding…':'Save category'}</button><button type="button" className="btn-ghost" disabled={busy} onClick={()=>setAdding(false)}>Cancel</button></div></div>:<button className="mt-2 text-xs font-semibold text-accent" type="button" onClick={()=>setAdding(true)}>+ Add category</button>}{error?<p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>:null}
  </div>;
}
