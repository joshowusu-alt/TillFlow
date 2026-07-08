export const WELCOME_CATEGORY_LINE =
  'POS, stock and cash control for Ghanaian retail businesses.';

export const WELCOME_HEADLINE = 'Sell fast. Track stock. Know your money.';

export const WELCOME_SUBHEADLINE =
  'Sell at the counter, track stock, manage cash, MoMo and credit, then close with the cash you expect.';

export const TRUST_BADGES = [
  'Offline-ready selling',
  'Cash, MoMo & credit',
  'Daily owner reports',
  'Built for Ghana',
] as const;

export const RETAIL_REALITY_BELT = [
  'Cash',
  'MoMo',
  'Credit customers',
  'Supplier payments',
  'Expenses paid from till',
  'Expected cash',
  'Stock alerts',
  'Staff shifts',
  'Offline-ready selling',
  'Owner reports',
  'Purchases',
  'Low stock',
] as const;

export const PRODUCT_PROOF_PANELS = [
  {
    id: 'pos',
    title: 'POS checkout',
    benefit: 'Sell quickly with cash, MoMo, card, transfer or credit.',
    visual: 'pos' as const,
  },
  {
    id: 'stock',
    title: 'Stock and suppliers',
    benefit: 'Track products, purchases, supplier payments and low stock.',
    visual: 'stock-suppliers' as const,
  },
  {
    id: 'cash',
    title: 'Cash drawer and shifts',
    benefit: 'Know expected cash, cash paid out, expenses, refunds and variances.',
    visual: 'shift-close' as const,
  },
  {
    id: 'reports',
    title: 'Reports and analytics',
    benefit: 'See revenue, profit, top products and peak trading hours.',
    visual: 'reports-analytics' as const,
  },
] as const;

export const TRUST_PROOF = {
  headline: 'Trusted in daily retail use.',
  intro:
    'EL-SHADDAI Supermarket uses TillFlow to run daily sales, staff shifts, stock tracking and cash control across 1,000+ products.',
  business: 'EL-SHADDAI Supermarket',
  person: 'Akosua Otchere',
  useNamedProof: true,
} as const;

export const TRUST_PROOF_THEMES = [
  {
    title: 'Offline selling stayed calm',
    quote:
      'The network went off. TillFlow did not. We sold normally, and everything synced on its own when the network came back.',
    featured: true,
  },
  {
    title: 'Closing became easier',
    quote:
      'We see what cash is expected to be there, and we close shifts with comments for any variance — which the owner sees.',
    featured: false,
  },
  {
    title: 'Profit got clearer',
    quote:
      'It was difficult to track profitable products as we grew past 1,000 products. TillFlow made those decisions much easier.',
    featured: false,
  },
] as const;
