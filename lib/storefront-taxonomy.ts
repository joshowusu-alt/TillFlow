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
  { label: 'Rice & staples', priority: 20, patterns: [/rice/, /gari/, /fufu/, /tom brown/, /oat/, /cereal/, /corn/, /food stuff/, /foodstuff/, /banku/, /kenkey/, /kokonte/, /ampesi/] },
  { label: 'Breakfast & cereal', priority: 22, patterns: [/breakfast/, /corn flakes/, /golden morn/, /granola/, /muesli/, /cereal/, /oat/] },
  { label: 'Cooking essentials', priority: 25, patterns: [/oil/, /tomato/, /shito/, /pepper/, /spaghetti/, /mackerel/, /sardine/, /tin fish/, /salt/, /margarine/, /mayonnaise/, /ketchup/, /vinegar/, /soya/, /seasoning/, /maggi/, /royco/, /knorr/, /curry/, /canned/] },
  { label: 'Pasta & noodles', priority: 27, patterns: [/spaghetti/, /macaroni/, /noodle/, /indomie/, /pasta/] },
  { label: 'Protein & meat', priority: 28, patterns: [/chicken/, /beef/, /fish/, /tuna/, /salmon/, /pork/, /turkey/, /sausage/, /hotdog/, /corned beef/, /protein/] },
  { label: 'Canned foods', priority: 30, patterns: [/canned/, /tin/, /baked beans/, /sweet corn/, /peas/, /tomato paste/] },
  { label: 'Dairy & eggs', priority: 32, patterns: [/cheese/, /yogurt/, /yoghurt/, /butter/, /egg/, /dairy/, /ice cream/, /condensed milk/, /evaporated milk/, /powdered milk/] },
  { label: 'Spices & seasonings', priority: 34, patterns: [/spice/, /seasoning/, /cube/, /maggi/, /royco/, /knorr/, /curry/, /thyme/, /ginger/, /garlic/] },
  { label: 'Drinks', priority: 35, patterns: [/drink/, /beverage/, /juice/, /water/, /wine/, /tea/, /milo/, /nescafe/, /energy/, /smoothie/, /malta/, /beer/, /stout/, /soft drink/, /soda/, /coca.?cola/, /pepsi/, /fanta/, /sprite/, /minerals/] },
  { label: 'Water & juice', priority: 36, patterns: [/water/, /juice/, /sobolo/, /fruit drink/, /fruit juice/, /sachet water/] },
  { label: 'Malt & energy drinks', priority: 37, patterns: [/malta/, /malt/, /energy/, /lucozade/, /blue jeans/, /rush/] },
  { label: 'Fruit & vegetables', priority: 38, patterns: [/fruit/, /vegetable/, /tomato/, /onion/, /pepper/, /plantain/, /banana/, /orange/, /avocado/, /mango/, /pineapple/, /lettuce/, /cabbage/, /carrot/, /cucumber/] },
  { label: 'Biscuits & snacks', priority: 40, patterns: [/bisc?uit/, /snack/, /toffee/, /chocolate/, /cake/, /pops/, /chips/, /crisp/, /popcorn/, /nuts/, /groundnut/, /peanut/, /chin.?chin/, /puff.?puff/] },
  { label: 'Sweets & confectionery', priority: 41, patterns: [/toffee/, /sweet/, /candy/, /lollipop/, /gum/, /mint/, /confection/] },
  { label: 'Bread & bakery', priority: 42, patterns: [/bread/, /rolls?/, /bun/, /pastry/, /doughnut/, /croissant/, /loaf/, /toast/, /malt bread/] },
  { label: 'Pastries & desserts', priority: 44, patterns: [/dessert/, /pastry/, /cake/, /meat pie/, /sausage roll/, /custard/] },
  { label: 'Baby & infant', priority: 50, patterns: [/baby/, /diaper/, /nappy/, /lactogen/, /nan\b/, /sma\b/, /yumvita/, /cerelac/, /infant/, /pampers/, /huggies/, /aptamil/] },
  { label: 'Baby food & formula', priority: 52, patterns: [/formula/, /cerelac/, /lactogen/, /nan\b/, /sma\b/, /yumvita/, /baby food/] },
  { label: 'Diapers & wipes', priority: 54, patterns: [/diaper/, /nappy/, /pampers/, /huggies/, /wipes/] },
  { label: 'Toiletries', priority: 60, patterns: [/toilet/, /toiletr/, /soap/, /paste/, /tooth/, /roll-on/, /body/, /lotion/, /cream/, /pad/, /tissue/, /wipes/, /perfume/, /cosmetic/, /vaseline/, /petroleum jelly/, /deodorant/, /antiperspirant/, /shower gel/, /shampoo/, /conditioner/] },
  { label: 'Oral care', priority: 61, patterns: [/toothpaste/, /toothbrush/, /mouthwash/, /oral/, /dental/] },
  { label: 'Skin & body care', priority: 62, patterns: [/body lotion/, /body cream/, /skin care/, /vaseline/, /petroleum jelly/, /body oil/, /scrub/] },
  { label: 'Beauty & hair', priority: 63, patterns: [/hair/, /relaxer/, /weave/, /wig/, /extension/, /perm/, /dye/, /makeup/, /lipstick/, /foundation/, /mascara/, /eyeliner/, /nail/, /polish/, /bleach cream/, /fair/, /toning/] },
  { label: 'Beauty & cosmetics', priority: 64, patterns: [/cosmetic/, /makeup/, /powder/, /lip gloss/, /lipstick/, /foundation/, /concealer/] },
  { label: 'Feminine care', priority: 65, patterns: [/sanitary/, /pad/, /tampon/, /liner/, /feminine/] },
  { label: 'Medicines & health', priority: 66, patterns: [/medicine/, /tablet/, /capsule/, /syrup/, /drug/, /pharmacy/, /panadol/, /paracetamol/, /ibuprofen/, /amoxicillin/, /antibiotic/, /vitamin/, /supplement/, /protein powder/, /eye drop/, /ear drop/, /oral rehydration/] },
  { label: 'First aid', priority: 67, patterns: [/first aid/, /bandage/, /plaster/, /cotton wool/, /gauze/, /antiseptic/, /dettol/] },
  { label: 'Wellness', priority: 68, patterns: [/wellness/, /antiseptic/, /dettol/, /plaster/, /ointment/, /balm/, /repellent/, /insecticide/, /coil/, /sanitizer/, /hand wash/, /first aid/, /bandage/, /cotton wool/, /gauze/] },
  { label: 'Vitamins & supplements', priority: 69, patterns: [/vitamin/, /supplement/, /multivitamin/, /immune booster/, /omega/, /zinc/] },
  { label: 'Cleaning', priority: 70, patterns: [/detergent/, /washing/, /bleach/, /omo/, /laundry/, /starch/, /polish/, /jik/, /sta-soft/, /comfort/, /sunrise/, /ariel/, /surf/, /mop/, /broom/, /duster/, /sponge/, /dustpan/] },
  { label: 'Laundry care', priority: 72, patterns: [/laundry/, /starch/, /fabric softener/, /sta-soft/, /comfort/, /washing powder/] },
  { label: 'Paper & disposables', priority: 74, patterns: [/tissue/, /napkin/, /paper towel/, /foil/, /cling film/, /disposable/, /take.?away/, /sachet/] },
  { label: 'Household', priority: 90, patterns: [/battery/, /candle/, /matches/, /envelope/, /stationery/, /cups/, /rubber/, /glue/, /gum/, /blade/, /brush/, /pen/, /pencil/, /notebook/, /tape/, /scissors/, /pins/, /nails/, /bulb/, /torch/] },
  { label: 'Kitchenware', priority: 91, patterns: [/plate/, /cup/, /bowl/, /spoon/, /fork/, /knife/, /kitchen/, /flask/, /storage container/] },
  { label: 'Stationery & school', priority: 92, patterns: [/stationery/, /exercise book/, /textbook/, /ruler/, /eraser/, /crayon/, /marker/, /pen\b/, /pencil/, /sharpener/, /set square/, /protractor/] },
  { label: 'Electricals & batteries', priority: 93, patterns: [/battery/, /bulb/, /extension/, /charger/, /electrical/, /torch/] },
  { label: 'Frozen & chilled', priority: 95, patterns: [/frozen/, /chilled/, /refrigerated/, /ice/, /cold/] },
  { label: 'Pet care', priority: 96, patterns: [/pet/, /dog food/, /cat food/, /litter/, /pet care/] },
  { label: 'Alcohol & spirits', priority: 98, patterns: [/alcohol/, /spirit/, /whisky/, /whiskey/, /gin/, /vodka/, /rum/, /schnapps/, /akpeteshie/, /alomo/, /bitters/] },
  { label: 'Tobacco', priority: 99, patterns: [/tobacco/, /cigarette/, /cigar/, /smoker/] },
];

const VARIANT_FIXES: Record<string, string> = {
  'air freshner': 'Air freshener',
  'air freshener': 'Air freshener',
  biscuit: 'Biscuits & snacks',
  biscuits: 'Biscuits & snacks',
  buscuits: 'Biscuits & snacks',
  buscuit: 'Biscuits & snacks',
  dairy: 'Dairy & eggs',
  diary: 'Dairy & eggs',
  drink: 'Drinks',
  drinks: 'Drinks',
  beverage: 'Drinks',
  beverages: 'Drinks',
  'soft drink': 'Drinks',
  'soft drinks': 'Drinks',
  minerals: 'Drinks',
  mineral: 'Drinks',
  juice: 'Water & juice',
  juices: 'Water & juice',
  water: 'Water & juice',
  cereal: 'Breakfast & cereal',
  cereals: 'Breakfast & cereal',
  breakfast: 'Breakfast & cereal',
  noodle: 'Pasta & noodles',
  noodles: 'Pasta & noodles',
  pasta: 'Pasta & noodles',
  confectionery: 'Sweets & confectionery',
  sweets: 'Sweets & confectionery',
  candy: 'Sweets & confectionery',
  'tin tomatoes': 'Cooking essentials',
  'tin tomato': 'Cooking essentials',
  'foodstuff': 'Rice & staples',
  'food stuffs': 'Rice & staples',
  'general': 'Essentials',
  'general goods': 'Essentials',
  'provision': 'Essentials',
  'provisions': 'Essentials',
  'grocery': 'Essentials',
  'groceries': 'Essentials',
  'personal care': 'Toiletries',
  'personal hygiene': 'Toiletries',
  'hygiene': 'Toiletries',
  'health & beauty': 'Toiletries',
  'beauty': 'Beauty & hair',
  'hair care': 'Beauty & hair',
  'hair products': 'Beauty & hair',
  'medicine': 'Medicines & health',
  'medicines': 'Medicines & health',
  'drugs': 'Medicines & health',
  'pharmaceutical': 'Medicines & health',
  'pharmaceuticals': 'Medicines & health',
  'health': 'Medicines & health',
  'health products': 'Medicines & health',
  'cleaning products': 'Cleaning',
  'household cleaners': 'Cleaning',
  'laundry': 'Cleaning',
  'baby care': 'Baby & infant',
  'baby products': 'Baby & infant',
  'infant': 'Baby & infant',
  diapers: 'Diapers & wipes',
  diaper: 'Diapers & wipes',
  nappy: 'Diapers & wipes',
  wipes: 'Diapers & wipes',
  toothpaste: 'Oral care',
  toothbrush: 'Oral care',
  dental: 'Oral care',
  'skin care': 'Skin & body care',
  skincare: 'Skin & body care',
  'frozen food': 'Frozen & chilled',
  'frozen foods': 'Frozen & chilled',
  'chilled': 'Frozen & chilled',
  kitchenware: 'Kitchenware',
  kitchen: 'Kitchenware',
  batteries: 'Electricals & batteries',
  battery: 'Electricals & batteries',
  pet: 'Pet care',
  'alcoholic beverages': 'Alcohol & spirits',
  'alcohol': 'Alcohol & spirits',
  'spirits': 'Alcohol & spirits',
  'beer': 'Alcohol & spirits',
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
