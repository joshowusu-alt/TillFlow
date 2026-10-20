'use client';
import Link from 'next/link';
import { useId, useState } from 'react';
import { quickCreateCategoryAction } from '@/app/actions/categories';
export type ClassificationDivision = {id:string;name:string;categoryId:string;groups:{id:string;name:string}[]};
export default function ProductCategoryField({categories,divisions=[],defaultValue='',defaultGroupId=''}:{categories:{id:string;name:string}[];divisions?:ClassificationDivision[];defaultValue?:string;defaultGroupId?:string}) {
  const id=useId();
  const [groupId,setGroupId]=useState(defaultGroupId),[search,setSearch]=useState('');
  const groups=divisions.flatMap(division=>division.groups.map(group=>({...group,divisionId:division.id,categoryId:division.categoryId,path:`${categories.find(category=>category.id===division.categoryId)?.name ?? ''} / ${division.name} / ${group.name}`})));
  const [divisionId,setDivisionId]=useState(groups.find(group=>group.id===defaultGroupId)?.divisionId ?? '');
  const selected=groups.find(group=>group.id===groupId);
  const [options,setOptions]=useState(categories), [value,setValue]=useState(defaultValue), [adding,setAdding]=useState(false), [name,setName]=useState(''), [busy,setBusy]=useState(false), [error,setError]=useState('');
  async function save(){if(busy)return;setBusy(true);setError('');try{const result=await quickCreateCategoryAction(name);if(!result.success){setError(result.error);return;}setOptions(current=>current.some(item=>item.id===result.data.id)?current:[...current,result.data]);setValue(result.data.id);setGroupId('');setDivisionId('');setAdding(false);setName('');}catch{setError('Could not add this category. Please try again.');}finally{setBusy(false);}}
  return <div className="space-y-2">
    <label className="label" htmlFor={`${id}-category`}>Category</label><select id={`${id}-category`} className="input" name="categoryId" value={selected?.categoryId ?? value} onChange={e=>{setValue(e.target.value);setGroupId('');setDivisionId('');}}><option value="">Uncategorised</option>{options.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
    <details open={Boolean(groupId)}><summary className="cursor-pointer text-xs font-semibold text-accent">Division and group (optional)</summary><div className="mt-2 space-y-2">
      <p className="text-xs text-black/55">Category → Division → Group → Product. You can keep this product in its category only.</p>
      {groups.length ? <>
      <label className="label" htmlFor={`${id}-division`}>Division</label><select id={`${id}-division`} className="input" value={divisionId} onChange={e=>{setDivisionId(e.target.value);setGroupId('');const division=divisions.find(item=>item.id===e.target.value);if(division)setValue(division.categoryId);}}><option value="">All divisions in this category</option>{divisions.filter(division=>!value || division.categoryId===value).map(division=><option key={division.id} value={division.id}>{division.name}</option>)}</select>
      <label className="label" htmlFor={`${id}-search`}>Find a group</label><input id={`${id}-search`} className="input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search category, division or group" />
      <label className="label" htmlFor={`${id}-group`}>Group</label><select id={`${id}-group`} className="input" name="groupId" value={groupId} onChange={e=>{const next=groups.find(group=>group.id===e.target.value);setGroupId(e.target.value);if(next){setValue(next.categoryId);setDivisionId(next.divisionId);}}}><option value="">Use category only</option>{groups.filter(group=>group.id===groupId || ((!value || group.categoryId===value) && (!divisionId || group.divisionId===divisionId) && group.path.toLowerCase().includes(search.toLowerCase()))).map(group=><option key={group.id} value={group.id}>{group.path}</option>)}</select><p className="text-xs text-black/55">Choose a group once. Its division and category are filled automatically.</p>
      </> : <><input type="hidden" name="groupId" value="" /><p className="text-xs text-black/55">No groups have been set up yet. Create a division under a category, then add a group under that division.</p></>}
      <Link href="/products?tab=categories" target="_blank" rel="noopener noreferrer" className="inline-block text-xs font-semibold text-accent underline">Set up categories, divisions and groups (opens in new tab)</Link>
    </div></details>
    {adding?<div className="mt-2 space-y-2"><input className="input" aria-label="New category name" value={name} maxLength={100} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void save();}}} /><div className="flex gap-2"><button className="btn-secondary" type="button" disabled={busy||!name.trim()} onClick={()=>void save()}>{busy?'Adding…':'Save category'}</button><button type="button" className="btn-ghost" disabled={busy} onClick={()=>setAdding(false)}>Cancel</button></div></div>:<button className="mt-2 text-xs font-semibold text-accent" type="button" onClick={()=>setAdding(true)}>+ Add category</button>}{error?<p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>:null}
  </div>;
}
