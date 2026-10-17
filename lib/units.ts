export type UnitLabel = {
  name: string;
  pluralName?: string;
};

export function pluralize(count: number, singular: string, plural?: string) {
  if (count === 1) return singular;
  if (plural) return plural;
  if (singular.endsWith('s')) return singular;
  if (singular.endsWith('x') || singular.endsWith('ch') || singular.endsWith('sh')) {
    return `${singular}es`;
  }
  if (singular.endsWith('y')) {
    return `${singular.slice(0, -1)}ies`;
  }
  return `${singular}s`;
}

export function formatMixedUnit({
  qtyBase,
  baseUnit,
  baseUnitPlural,
  packagingUnit,
  packagingUnitPlural,
  packagingConversion
}: {
  qtyBase: number;
  baseUnit: string;
  baseUnitPlural?: string;
  packagingUnit?: string;
  packagingUnitPlural?: string;
  packagingConversion?: number;
}) {
  if (!packagingUnit || !packagingConversion || packagingConversion <= 1) {
    return `${qtyBase} ${pluralize(qtyBase, baseUnit, baseUnitPlural)}`;
  }

  if (qtyBase >= packagingConversion) {
    const packs = Math.floor(qtyBase / packagingConversion);
    const remainder = qtyBase % packagingConversion;
    const packsLabel = pluralize(packs, packagingUnit, packagingUnitPlural);
    const remainderLabel = pluralize(remainder, baseUnit, baseUnitPlural);
    return remainder > 0
      ? `${packs} ${packsLabel} + ${remainder} ${remainderLabel}`
      : `${packs} ${packsLabel}`;
  }

  return `${qtyBase} ${pluralize(qtyBase, baseUnit, baseUnitPlural)}`;
}

/**
 * Catalogue column label. Shows the real base unit ("piece"), not a sample
 * quantity such as "2 pieces". Packaging is described as a conversion.
 */
export function formatCatalogueUnitLabel(input: {
  baseName?: string | null;
  basePlural?: string | null;
  packagingName?: string | null;
  packagingConversion?: number | null;
}): string {
  const base = input.baseName?.trim() || 'unit';
  const pack = input.packagingName?.trim();
  const conversion = input.packagingConversion ?? 0;
  if (pack && conversion > 1) {
    return `${base} · 1 ${pack} = ${conversion} ${pluralize(conversion, base, input.basePlural ?? undefined)}`;
  }
  return base;
}

export function getPrimaryPackagingUnit<T extends { conversionToBase: number; unit: UnitLabel }>(
  units: T[]
) {
  return units
    .filter((unit) => unit.conversionToBase > 1)
    .sort((a, b) => b.conversionToBase - a.conversionToBase)[0];
}
