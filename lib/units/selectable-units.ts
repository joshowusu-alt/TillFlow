/**
 * Unit rows are global (no businessId). QA and other tenants have created
 * junk names such as "Piece-554150" and "Walkthrough unit" on that shared
 * table. Dropdowns must not list those rows.
 *
 * We do not add businessId or rewrite ProductUnit / SalesInvoiceLine /
 * PurchaseLine foreign keys. Existing businesses keep working because:
 * - the shared standard row they already reference stays in place
 * - any unit already attached to their products is still offered
 * - a new business only sees one row per standard name, plus its own units
 *
 * The live demo piece row must remain selectable when it is the canonical
 * shared piece (or already referenced by that tenant).
 */
export const STANDARD_UNIT_NAMES = [
  'piece',
  'carton',
  'bottle',
  'pack',
  'bag',
  'box',
  'sachet',
  'tin',
  'crate',
] as const;

export type StandardUnitName = (typeof STANDARD_UNIT_NAMES)[number];

/** Shared piece row referenced by the live demo tenant. Do not retarget it. */
export const SHARED_PIECE_UNIT_ID = 'cmls0rh5o000891hwmkhl59uz';

export type SelectableUnit = {
  id: string;
  name: string;
  pluralName?: string | null;
};

export function normaliseUnitName(name: string): string {
  return name.trim().toLowerCase();
}

export function isExactStandardUnitName(name: string): name is StandardUnitName {
  return (STANDARD_UNIT_NAMES as readonly string[]).includes(normaliseUnitName(name));
}

/** Case variants Prisma `in` can match without a Postgres-only filter. */
export function standardUnitNameLookupValues(): string[] {
  return STANDARD_UNIT_NAMES.flatMap((name) => {
    const titled = name.charAt(0).toUpperCase() + name.slice(1);
    return titled === name ? [name] : [name, titled];
  });
}

export function defaultBaseUnitId(units: Pick<SelectableUnit, 'id' | 'name'>[]): string {
  return units.find((unit) => normaliseUnitName(unit.name) === 'piece')?.id ?? units[0]?.id ?? '';
}

function pickCanonicalStandard(
  name: StandardUnitName,
  candidates: SelectableUnit[],
  preferredPieceId: string,
): SelectableUnit | null {
  if (candidates.length === 0) return null;
  if (name === 'piece') {
    const preferred = candidates.find((unit) => unit.id === preferredPieceId);
    if (preferred) return preferred;
  }
  return [...candidates].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0] ?? null;
}

/**
 * One row per standard name for a business that has not used that name yet
 * (preferring the shared piece id), plus every non-standard unit this
 * business already attached to a product.
 */
export function selectUnitsForBusiness(input: {
  standardCandidates: SelectableUnit[];
  businessUnits: SelectableUnit[];
  preferredPieceId?: string;
}): SelectableUnit[] {
  const preferredPieceId = input.preferredPieceId ?? SHARED_PIECE_UNIT_ID;
  const businessIds = new Set(input.businessUnits.map((unit) => unit.id));
  const byName = new Map<string, SelectableUnit[]>();

  for (const unit of input.standardCandidates) {
    const key = normaliseUnitName(unit.name);
    if (!isExactStandardUnitName(key)) continue;
    const list = byName.get(key) ?? [];
    if (!list.some((existing) => existing.id === unit.id)) list.push(unit);
    byName.set(key, list);
  }

  const chosen: SelectableUnit[] = [];
  const chosenIds = new Set<string>();

  for (const name of STANDARD_UNIT_NAMES) {
    const candidates = byName.get(name) ?? [];
    const used = candidates.filter((unit) => businessIds.has(unit.id));
    const picks = used.length > 0 ? used : [pickCanonicalStandard(name, candidates, preferredPieceId)].filter(
      (unit): unit is SelectableUnit => Boolean(unit),
    );
    for (const unit of picks) {
      if (chosenIds.has(unit.id)) continue;
      chosenIds.add(unit.id);
      chosen.push(unit);
    }
  }

  const custom = input.businessUnits
    .filter((unit) => !chosenIds.has(unit.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return [...chosen, ...custom];
}
