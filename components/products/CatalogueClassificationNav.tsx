import Link from 'next/link';
import { catalogueCount, catalogueHref, catalogueSelection, type CatalogueCategory, type CatalogueDivision,
  type CatalogueCount, type CatalogueSelection } from '@/lib/products/catalogue-classification';

export default function CatalogueClassificationNav({ categories, divisions, counts, selection, context }: {
  categories: CatalogueCategory[]; divisions: CatalogueDivision[]; counts: CatalogueCount[];
  selection: CatalogueSelection; context: Record<string, string | undefined>;
}) {
  const current = catalogueSelection(categories, divisions, selection);
  const categoryId = current.category?.id;
  const children = divisions.filter(d => d.categoryId === categoryId);
  const total = (scope: CatalogueSelection) => catalogueCount(counts, divisions, scope);
  function choice(label: string, scope: CatalogueSelection, selected: boolean) {
    return <Link key={label + JSON.stringify(scope)} href={catalogueHref(context, scope)} scroll={false}
      aria-current={selected && current.valid ? 'page' : undefined}
      className={`inline-flex min-h-[44px] min-w-0 max-w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${selected && current.valid ? 'border-accent bg-accent text-white' : 'border-slate-200 bg-white text-ink hover:bg-slate-50'}`}>
      <span className="break-words [overflow-wrap:anywhere]">{label}</span>
      <span className="shrink-0 text-xs tabular-nums opacity-80" aria-label={`${total(scope)} products`}>{total(scope).toLocaleString()}</span>
    </Link>;
  }
  return <nav aria-label="Browse catalogue classification" className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4">
    <p className="text-xs text-ink/65">Product counts{context.q ? ' within this search' : context.issue || context.missingCost ? ' within this review' : ''} · not stock quantities</p>
    <div className="grid gap-2 sm:grid-cols-[80px_minmax(0,1fr)]"><span className="text-xs font-semibold text-ink/65 sm:pt-3">Category</span><div className="flex min-w-0 flex-wrap gap-2">
      {choice('All categories', {}, !selection.category && !selection.division && !selection.group)}
      {categories.map(category => choice(category.name, { category: category.id }, category.id === categoryId))}
    </div></div>
    {current.valid && categoryId && <div className="grid gap-2 sm:grid-cols-[80px_minmax(0,1fr)]"><span className="text-xs font-semibold text-ink/65 sm:pt-3">Division</span><div className="flex min-w-0 flex-wrap gap-2">
      {children.length ? <>{choice('All divisions', { category: categoryId }, !current.division)}{children.map(division => choice(division.name, { category: categoryId, division: division.id }, division.id === current.division?.id))}</>
        : <span className="py-2 text-sm text-ink/65">Category-only products · no divisions set up</span>}
    </div></div>}
    {current.valid && current.division && <div className="grid gap-2 sm:grid-cols-[80px_minmax(0,1fr)]"><span className="text-xs font-semibold text-ink/65 sm:pt-3">Group</span><div className="flex min-w-0 flex-wrap gap-2">
      {choice('All groups', { category: categoryId, division: current.division.id }, !current.group)}
      {current.division.groups.map(group => choice(group.name, { category: categoryId, division: current.division!.id, group: group.id }, group.id === current.group?.id))}
    </div></div>}
    <p className="border-t border-slate-200 pt-3 text-sm text-ink/75" aria-live="polite">
      {current.valid ? [current.category?.name ?? 'All categories', current.division?.name, current.group?.name].filter(Boolean).join(' → ')
        : <>This classification combination is unavailable. <Link href={catalogueHref(context, {})} className="font-semibold text-accent underline">Clear classification filters</Link></>}
    </p>
  </nav>;
}
