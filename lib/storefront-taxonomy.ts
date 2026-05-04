export type StorefrontCategoryMappingInput = {
  rawCategoryName: string;
  publicCategoryName: string;
  priority: number;
  hidden?: boolean | null;
};

export type PublicCategory = {
  id: string;
  name: string;
  count: number;
  priority: number;
};

type DefaultRule = {
  label: string;
  priority: number;
  patterns: RegExp[];
};

const DEFAULT_RULES: DefaultRule[] = [
  { label: 'Popular', priority: 0, patterns: [] },
  { label: 'Essentials', priority: 10, patterns: [/essential/, /bread/, /egg/, /water/, /milk\b/, /sugar/, /salt/] },
  { label: 'Rice & staples', priority: 20, patterns: [/rice/, /gari/, /fufu/, /tom brown/, /oat/, /cereal/, /corn/, /food stuff/] },
  { label: 'Cooking essentials', priority: 25, patterns: [/oil/, /tomato/, /shito/, /pepper/, /spaghetti/, /mackerel/, /sardine/, /tin fish/, /salt/, /margarine/, /mayonnaise/] },
  { label: 'Drinks', priority: 30, patterns: [/drink/, /beverage/, /juice/, /water/, /wine/, /tea/, /milo/, /nescafe/, /energy/] },
  { label: 'Biscuits & snacks', priority: 40, patterns: [/bisc?uit/, /snack/, /toffee/, /chocolate/, /cake/, /pops/] },
  { label: 'Baby', priority: 50, patterns: [/baby/, /diaper/, /lactogen/, /nan/, /sma/, /yumvita/] },
  { label: 'Toiletries', priority: 60, patterns: [/toilet/, /toiletr/, /soap/, /paste/, /tooth/, /roll-on/, /body/, /lotion/, /cream/, /pad/, /tissue/, /wipes/, /perfume/, /cosmetic/] },
  { label: 'Cleaning', priority: 70, patterns: [/detergent/, /washing/, /bleach/, /omo/, /laundry/, /starch/, /polish/] },
  { label: 'Wellness', priority: 80, patterns: [/medicine/, /wellness/, /antiseptic/, /dettol/, /plaster/, /ointment/, /balm/, /repellent/, /insecticide/, /coil/] },
  { label: 'Household', priority: 90, patterns: [/battery/, /candle/, /matches/, /envelope/, /stationery/, /cups/, /rubber/, /glue/, /gum/, /blade/, /brush/] },
];

const VARIANT_FIXES: Record<string, string> = {
  'air freshner': 'Air freshener',
  'air freshener': 'Air freshener',
  biscuit: 'Biscuits & snacks',
  biscuits: 'Biscuits & snacks',
  buscuits: 'Biscuits & snacks',
  buscuit: 'Biscuits & snacks',
  dairy: 'Dairy',
  diary: 'Dairy',
  drink: 'Drinks',
  drinks: 'Drinks',
  beverage: 'Drinks',
  beverages: 'Drinks',
  'tin tomatoes': 'Cooking essentials',
  'tin tomato': 'Cooking essentials',
};

export function slugifyPublicCategory(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'other';
}

export function normalizePublicCategoryName(rawCategoryName: string | null | undefined): { name: string; priority: number } {
  const raw = (rawCategoryName ?? '').trim();
  if (!raw) return { name: 'Other', priority: 999 };

  const lower = raw.toLowerCase().replace(/\s+/g, ' ');
  const fixed = VARIANT_FIXES[lower];
  if (fixed) {
    const rule = DEFAULT_RULES.find((candidate) => candidate.label === fixed);
    return { name: fixed, priority: rule?.priority ?? 100 };
  }

  for (const rule of DEFAULT_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(lower))) {
      return { name: rule.label, priority: rule.priority };
    }
  }

  return { name: toPublicTitle(raw), priority: 500 };
}

export function buildCategoryMappingLookup(mappings: StorefrontCategoryMappingInput[]) {
  const lookup = new Map<string, StorefrontCategoryMappingInput>();
  for (const mapping of mappings) {
    lookup.set(mapping.rawCategoryName.trim().toLowerCase(), mapping);
  }
  return lookup;
}

export function resolvePublicCategory(
  rawCategoryName: string | null | undefined,
  mappingLookup: Map<string, StorefrontCategoryMappingInput>,
) {
  const raw = (rawCategoryName ?? '').trim();
  const mapping = raw ? mappingLookup.get(raw.toLowerCase()) : null;
  if (mapping) {
    return {
      id: slugifyPublicCategory(mapping.publicCategoryName),
      name: mapping.publicCategoryName,
      priority: mapping.priority,
      hidden: Boolean(mapping.hidden),
    };
  }

  const normalized = normalizePublicCategoryName(raw);
  return {
    id: slugifyPublicCategory(normalized.name),
    name: normalized.name,
    priority: normalized.priority,
    hidden: false,
  };
}

export function toPublicTitle(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function suggestedPublicCategoryOptions() {
  return DEFAULT_RULES.filter((rule) => rule.label !== 'Popular').map((rule) => ({
    name: rule.label,
    priority: rule.priority,
  }));
}
