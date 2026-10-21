'use client';
import { SalesMixChart } from '@/components/reports/charts/ReportVisuals';
import Link from 'next/link';
import { useId, useState } from 'react';
import { formatMoney } from '@/lib/format';
import type { ClassificationCategory, ClassificationLevel, ClassificationSalesRow } from '@/lib/reports/classification-sales';

export default function ClassificationPerformanceClient({ categories, rows, currency }: {
  categories: ClassificationCategory[]; rows: ClassificationSalesRow[]; currency: string;
}) {
  const id = useId();
  const [level, setLevel] = useState<ClassificationLevel>('category');
  const [categoryId, setCategoryId] = useState(''), [divisionId, setDivisionId] = useState(''), [groupId, setGroupId] = useState('');
  const [page, setPage] = useState(1);
  const divisions = categories.filter(category => !categoryId || category.id === categoryId).flatMap(category => category.divisions.map(division => ({ ...division, label: `${category.name} / ${division.name}` })));
  const groups = divisions.filter(division => !divisionId || division.id === divisionId).flatMap(division => division.groups.map(group => ({ ...group, label: `${division.label} / ${group.name}` })));
  const filtered = rows.filter(row => row.level === level && (!categoryId || row.categoryId === (categoryId === '__unassigned' ? null : categoryId)) && (!divisionId || row.divisionId === (divisionId === '__none' ? null : divisionId)) && (!groupId || row.groupId === (groupId === '__none' ? null : groupId)));
  const pages = Math.max(1, Math.ceil(filtered.length / 25)), currentPage = Math.min(page, pages);
  const net = filtered.reduce((sum, row) => sum + row.netSalesPence, 0);
  const incomplete = filtered.some(row => row.costPence === null);
  const cost = incomplete ? null : filtered.reduce((sum, row) => sum + (row.costPence ?? 0), 0);
  const money = (value: number | null) => value === null ? 'Costs incomplete' : formatMoney(value, currency);
  function drill(row: ClassificationSalesRow) {
    setCategoryId(row.categoryId ?? '__unassigned'); setDivisionId(row.divisionId ?? (row.level === 'division' || row.level === 'group' ? '__none' : '')); setGroupId(row.groupId ?? (row.level === 'group' ? '__none' : ''));
    setLevel(row.level === 'category' ? 'division' : row.level === 'division' && row.divisionId ? 'group' : 'product');
    setPage(1);
  }
  return <section id="classification-performance" className="card min-w-0 space-y-4 p-4 sm:p-5">
    <div><h2 className="text-lg font-semibold">Classification performance</h2><p className="mt-1 text-sm text-ink/65">Compare categories, divisions, groups and products for the report period and branch above. Tap a name to explore the next level.</p></div>
    <p className="rounded-xl bg-blue-50 p-3 text-xs text-blue-900">Net sales exclude tax and include discounts. Recorded cost comes from each sale; gross profit is before operating expenses. This view uses the current product classification, so changing a product’s group moves its earlier sales into that group.</p>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div><label className="label" htmlFor={`${id}-level`}>Compare by</label><select className="input" id={`${id}-level`} value={level} onChange={event => { setLevel(event.target.value as ClassificationLevel); setDivisionId(''); setGroupId(''); setPage(1); }}><option value="category">Category</option><option value="division">Division</option><option value="group">Group</option><option value="product">Product</option></select></div>
      <div><label className="label" htmlFor={`${id}-category`}>Category</label><select className="input" id={`${id}-category`} value={categoryId} onChange={event => { setCategoryId(event.target.value); setDivisionId(''); setGroupId(''); setPage(1); }}><option value="">All categories</option><option value="__unassigned">Uncategorised</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
      {level === 'group' || level === 'product' ? <div><label className="label" htmlFor={`${id}-division`}>Division</label><select className="input" id={`${id}-division`} value={divisionId} onChange={event => { setDivisionId(event.target.value); setGroupId(''); setPage(1); }}><option value="">All divisions</option><option value="__none">Category only (no division)</option>{divisions.map(division => <option key={division.id} value={division.id}>{division.label}</option>)}</select></div> : null}
      {level === 'product' ? <div><label className="label" htmlFor={`${id}-group`}>Group</label><select className="input" id={`${id}-group`} value={groupId} onChange={event => { setGroupId(event.target.value); setPage(1); }}><option value="">All groups</option><option value="__none">No group assigned</option>{groups.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}</select></div> : null}
    </div>
    <SalesMixChart title={`${level.charAt(0).toUpperCase() + level.slice(1)} net sales mix`} rows={filtered.map(row => ({ name: row.name, value: row.netSalesPence }))} currency={currency} />
    <div className="responsive-table-shell"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-3" scope="col">Classification / product</th>{['Products', 'Units sold', 'Net sales (ex tax)', 'Recorded cost', 'Gross profit', 'Margin'].map(label => <th scope="col" className="whitespace-nowrap p-3 text-right" key={label}>{label}</th>)}</tr></thead><tbody>
      {filtered.slice((currentPage - 1) * 25, currentPage * 25).map(row => <tr key={row.key} className="border-t"><td className="min-w-[13rem] p-3">{row.productId ? <Link className="font-semibold text-accent underline" href={`/products/${row.productId}`}>{row.name}</Link> : <button type="button" className="text-left font-semibold text-accent underline" onClick={() => drill(row)}>{row.name} →</button>}<p className="mt-1 text-xs text-ink/55">{row.path}</p></td><td className="p-3 text-right tabular-nums">{row.productCount}</td><td className="p-3 text-right tabular-nums">{row.qtySold.toLocaleString()}</td><td className="whitespace-nowrap p-3 text-right tabular-nums">{money(row.netSalesPence)}</td><td className="whitespace-nowrap p-3 text-right tabular-nums">{money(row.costPence)}</td><td className="whitespace-nowrap p-3 text-right tabular-nums">{money(row.profitPence)}</td><td className="p-3 text-right tabular-nums">{row.marginPercent === null ? '—' : `${row.marginPercent.toFixed(1)}%`}</td></tr>)}
    </tbody><tfoot className="border-t font-semibold"><tr><th scope="row" className="p-3">Total across all pages</th><td className="p-3 text-right">{filtered.reduce((sum, row) => sum + row.productCount, 0)}</td><td className="p-3 text-right">{filtered.reduce((sum, row) => sum + row.qtySold, 0).toLocaleString()}</td><td className="whitespace-nowrap p-3 text-right">{money(net)}</td><td className="whitespace-nowrap p-3 text-right">{money(cost)}</td><td className="whitespace-nowrap p-3 text-right">{money(cost === null ? null : net - cost)}</td><td className="p-3 text-right">{cost === null || net === 0 ? '—' : `${((net - cost) / net * 100).toFixed(1)}%`}</td></tr></tfoot></table></div>
    {!filtered.length ? <p className="text-sm text-ink/60">No classifications or products in this selection.</p> : null}
    <div className="flex items-center justify-between gap-3 text-sm"><button className="btn-secondary" type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage} of {pages}</span><button className="btn-secondary" type="button" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Next</button></div>
    <Link className="inline-block text-sm font-semibold text-accent underline" href="/products?tab=categories">Manage categories, divisions and groups</Link>
  </section>;
}
