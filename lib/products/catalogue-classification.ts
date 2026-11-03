export type CatalogueCategory = { id: string; name: string };
export type CatalogueDivision = { id: string; name: string; categoryId: string; groups: { id: string; name: string }[] };
export type CatalogueCount = { categoryId: string | null; groupId: string | null; count: number };
export type CatalogueSelection = { category?: string; division?: string; group?: string };

export function catalogueSelection(categories: CatalogueCategory[], divisions: CatalogueDivision[], raw: CatalogueSelection) {
  const groupDivision = raw.group ? divisions.find(d => d.groups.some(g => g.id === raw.group)) : undefined;
  const division = raw.division ? divisions.find(d => d.id === raw.division) : groupDivision;
  const categoryId = raw.category || division?.categoryId || '';
  const category = categories.find(c => c.id === categoryId);
  const valid = (!raw.category || !!category) && (!raw.division || !!division) && (!raw.group || !!groupDivision)
    && (!division || division.categoryId === categoryId) && (!raw.group || division?.id === groupDivision?.id);
  return { valid, category, division, group: groupDivision?.groups.find(g => g.id === raw.group) };
}

export function catalogueCount(counts: CatalogueCount[], divisions: CatalogueDivision[], selection: CatalogueSelection) {
  const groupIds = selection.division ? new Set(divisions.find(d => d.id === selection.division)?.groups.map(g => g.id) ?? []) : null;
  return counts.reduce((sum, row) => sum + (
    (!selection.category || row.categoryId === selection.category) &&
    (!selection.group || row.groupId === selection.group) &&
    (!groupIds || (row.groupId !== null && groupIds.has(row.groupId))) ? row.count : 0
  ), 0);
}

/** Always set a complete ancestry on child links; remove stale descendants and page. */
export function catalogueHref(context: Record<string, string | undefined>, selection: CatalogueSelection) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(context)) if (value && !['category', 'division', 'group', 'page'].includes(key)) params.set(key, value);
  for (const key of ['category', 'division', 'group'] as const) if (selection[key]) params.set(key, selection[key]!);
  // An explicit clear is not a bare list revisit. Otherwise the document
  // navigation's first-mount state restore can reinstate the old selection.
  if (!params.get('q') && !selection.category && !selection.division && !selection.group) params.set('resetClassification', '1');
  const query = params.toString();
  return `/products${query ? `?${query}` : ''}`;
}
