/** Central copy for the public welcome / landing page. */

export const WELCOME_CATEGORY_LINE = 'See what is happening while the day is still running.';

export const WELCOME_HEADLINE = 'Complete control over your business.';

export const WELCOME_SUBHEADLINE =
  "Where did today's money go? Why does the till not match? Why do problems only appear after closing?";

export const WELCOME_ANCHOR = 'Know before you count.';

export const WELCOME_HERO_SUPPORT_WHATSAPP =
  'See how it would work in your business. WhatsApp first — no setup needed for the walkthrough.';

export const WELCOME_HERO_SUPPORT_FALLBACK =
  'See how it would work in your business. Book a walkthrough — no setup needed to start.';

/** Recurring TillFlow-owned phrases. Use sparingly and intentionally. */
export const CONTROL_LANGUAGE = {
  knowBeforeYouCount: 'Know before you count.',
  expectedCash: 'Expected Cash',
  closingConfidence: 'Closing Confidence',
  ownerView: 'Owner View',
  moneyVisibility: 'Money Visibility',
} as const;

/** Compact early trust — verified EL-SHADDAI facts only. */
export const EARLY_NAMED_PROOF = {
  eyebrow: 'Trusted by EL-SHADDAI Supermarket',
  line: 'Runs daily sales, staff shifts, stock tracking and cash control across 1,000+ products.',
  hook: 'They can see the cash expected — even when the network drops.',
} as const;

/** Stage 3 — control promises that product proof later evidences. */
export const CONTROL_POINTS = [
  'See what should be in the till before you count it.',
  'See which products are making you money.',
  'Spot what needs reordering before the shelf is empty.',
  'See which supplier needs attention first.',
  'See where your profit comes from while the day is still running.',
] as const;

export const CONTROL_SECTION = {
  eyebrow: 'Daily control',
  headline: 'You stop guessing what is happening in your business.',
  intro:
    'Cash, MoMo, credit, stock, staff and profit — in one Owner View. You can see what is happening while the day is still running.',
} as const;

/** Four carefully selected owner moments — different pressures, not a wall of cards. */
export const OWNER_MOMENTS = [
  'The supplier arrives before lunch.',
  'Three customers want MoMo.',
  'The network drops.',
  'Closing time comes.',
] as const;

export const RETAIL_REALITY_BELT = [
  'Cash',
  'MoMo',
  'Credit',
  'Supplier payments',
  'Till expenses',
  'Expected cash',
  'Staff shifts',
  'Owner closing',
  'Low stock',
  'Purchases',
] as const;

export const HOPE_STRIP = {
  eyebrow: 'You are not alone',
  headline: 'These are normal Ghana retail days.',
  body: 'Cash and MoMo in the same till. Credit customers. Supplier payments. Expenses from the drawer. Weekend stock counts. Closing that never quite matches the feeling in your head.',
} as const;

/** Sparse emotional bridges. */
export const MICRO_PRIMES = {
  beforeControl: 'You should not have to wait until closing time to see whether today was a good day.',
  beforeProof: 'Most problems are discovered after the money is already gone.',
  beforePricing: 'Numbers only matter if there is still time to act on them.',
} as const;

export const PRODUCT_PROOF_SECTION = {
  eyebrow: 'See the control',
  headline: 'Proof that you can act — not guess.',
  intro: 'See what TillFlow reveals before problems become losses.',
} as const;

export const MID_FUNNEL_CTA = {
  headline: 'See what TillFlow would reveal about your business.',
  support: 'A 15-minute WhatsApp walkthrough — honest, and no setup needed to start.',
  supportFallback: 'A 15-minute walkthrough — honest, and no setup needed to start.',
} as const;

export type ProductProofRhythm = 'claim-visual-proof' | 'moment-visual-outcome' | 'prime-visual-explain' | 'outcome-visual-quote';

export const PRODUCT_PROOF_PANELS = [
  {
    id: 'pos',
    title: 'Every sale starts correctly.',
    benefit: 'You stop typing known prices from memory. Cash, MoMo, card, transfer and credit begin from the same product record.',
    visual: 'pos' as const,
    rhythm: 'claim-visual-proof' as const,
    proofLine: 'One product record. Every payment method.',
  },
  {
    id: 'stock',
    title: 'Never lose track of stock.',
    benefit: 'See what is low, what is out and which supplier needs paying before the shelf is empty.',
    visual: 'stock-suppliers' as const,
    rhythm: 'moment-visual-outcome' as const,
    moment: 'Before the shelf goes empty.',
    proofLine: 'Stock and suppliers in one view.',
  },
  {
    id: 'cash',
    title: 'Know before you count.',
    benefit: 'See what the till should contain before closing begins.',
    visual: 'shift-close' as const,
    rhythm: 'prime-visual-explain' as const,
    moment: 'Closing time comes.',
    proofLine: 'Expected Cash. Closing Confidence.',
  },
  {
    id: 'reports',
    title: 'See where your profit is coming from.',
    benefit: 'Revenue, profit, margin and top products while there is still time to act.',
    visual: 'reports-analytics' as const,
    rhythm: 'outcome-visual-quote' as const,
    proofLine: 'Act before the day is gone.',
  },
] as const;

export const BUSINESS_STORIES_SECTION = {
  eyebrow: 'Business stories',
  headline: 'How owners got control back.',
  intro: 'Real businesses. Real closing days. Real changes.',
} as const;

export type BusinessStory = {
  id: string;
  business: string;
  person: string;
  focus: string;
  hook: string;
  before: string;
  problem: string;
  turningPoint: string;
  lifeNow: string;
  featured?: boolean;
};

export const BUSINESS_STORIES: BusinessStory[] = [
  {
    id: 'el-shaddai',
    business: 'EL-SHADDAI Supermarket',
    person: 'Akosua Otchere',
    focus: 'Closing confidence · expected cash · staff shifts',
    hook: 'They can see expected cash and keep selling when the network drops.',
    before: 'Closing meant hoping the till felt right after cash, MoMo and staff shifts.',
    problem:
      'With 1,000+ products, expected cash, variances and which products made money were hard to see clearly.',
    turningPoint:
      'They put daily sales, staff shifts, stock and cash control on TillFlow — including days when the network went off.',
    lifeNow:
      'They see expected cash, close shifts with owner-visible comments, and keep selling when the network drops. Everything syncs when it returns.',
    featured: true,
  },
  {
    id: 'fenibed',
    business: 'FENIBED Enterprise',
    person: 'Owner',
    focus: 'Weekend calculations · stock checks · daily clarity',
    hook: 'They see the whole week in one click — instead of spending the weekend calculating it.',
    before: 'Weekends disappeared into calculating sales and checking stock by hand.',
    problem: 'By the time the numbers were finished, the trading week was already gone.',
    turningPoint: 'They moved the daily picture into TillFlow instead of rebuilding it on paper every weekend.',
    lifeNow:
      'They open TillFlow and see what happened — sales, stock and the shape of the week — without the weekend calculation marathon.',
  },
  {
    id: 'aseda',
    business: 'ASEDA Enterprise',
    person: 'Owner',
    focus: 'Pricing accuracy · product selection · mistake prevention',
    hook: 'They stopped typing known prices by hand — and removed a whole class of till mistakes.',
    before: 'Prices were sometimes entered by hand at the counter.',
    problem:
      'A manual pricing error charged GH₵2,000 instead of GH₵3,000. The mistake was not discovered until much later.',
    turningPoint: 'They stopped typing amounts for known products and selected products in TillFlow instead.',
    lifeNow: 'That class of mistake is gone — the price comes with the product, not from memory under pressure.',
  },
] as const;

/** Compatibility aliases for older imports. */
export const TRUST_PROOF = {
  headline: BUSINESS_STORIES_SECTION.headline,
  intro: BUSINESS_STORIES_SECTION.intro,
  business: BUSINESS_STORIES[0].business,
  person: BUSINESS_STORIES[0].person,
  useNamedProof: true,
} as const;

export const TRUST_PROOF_THEMES = BUSINESS_STORIES.map((story) => ({
  title: story.focus,
  quote: story.hook,
  featured: Boolean(story.featured),
}));

export const PRICING_SECTION = {
  eyebrow: 'Pricing',
  headline: 'Choose the level of control your business needs now.',
  primaryAction: 'See which plan fits your business',
  support:
    'We will tell you honestly which setup fits — including if TillFlow is not right for you yet.',
  supportFallback: 'Not sure which setup fits? Start a walkthrough and we will tell you honestly.',
} as const;

/** Core pricing reassurances — keep the strip short. */
export const OBJECTION_REASSURANCES_CORE = [
  'Works on phone, tablet and laptop',
  'The internet can stop; selling can continue and sync later',
  'No barcode? TillFlow can generate an internal barcode and printable label',
] as const;

export const OBJECTION_PLAN_FIT_WHATSAPP = 'Not sure which plan fits? Ask on WhatsApp';
export const OBJECTION_PLAN_FIT_FALLBACK = 'Not sure which plan fits? Book a walkthrough';
export const OBJECTION_MULTI_BRANCH = 'Multi-branch control is available on Pro';

/** @deprecated Prefer the split reassurance constants above. */
export const OBJECTION_REASSURANCES = [
  ...OBJECTION_REASSURANCES_CORE,
  OBJECTION_MULTI_BRANCH,
  OBJECTION_PLAN_FIT_WHATSAPP,
] as const;

export const OBJECTION_REASSURANCES_FALLBACK = [
  ...OBJECTION_REASSURANCES_CORE,
  OBJECTION_MULTI_BRANCH,
  OBJECTION_PLAN_FIT_FALLBACK,
] as const;

export const FINAL_CTA = {
  headline: 'Know before you count.',
  body: 'You should not have to wait until closing to see what happened. See how TillFlow would work in your business.',
} as const;
