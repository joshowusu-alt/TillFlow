export const WELCOME_HEADLINE = 'Sell fast. Track stock. Know your money.';

export const WELCOME_SUBHEADLINE =
  'TillFlow helps Ghanaian retail businesses sell at the counter, track stock, manage cash and MoMo, follow up credit and suppliers, and see clear owner reports — even when the internet is unreliable.';

export const TRUST_BADGES = [
  'Offline-ready selling',
  'Cash, MoMo & credit',
  'Daily owner reports',
  'Built for Ghana',
] as const;

export const OUTCOME_CARDS = [
  {
    title: 'Sell at the counter',
    desc: 'Fast POS for cash, MoMo, card, transfer and credit sales.',
    icon: 'pos',
  },
  {
    title: 'Control stock and suppliers',
    desc: 'Track products, purchases, supplier payments and low stock.',
    icon: 'stock',
  },
  {
    title: 'Close with confidence',
    desc: 'See cash in, cash out, expenses, refunds and expected cash.',
    icon: 'close',
  },
] as const;

export const PRODUCT_PROOF_POINTS: Array<{
  title: string;
  desc: string;
}> = [
  {
    title: 'Counter sales stay fast',
    desc: 'Search products, take mixed payments and see change without slowing the queue.',
  },
  {
    title: 'Owners see the day clearly',
    desc: 'Revenue, transactions, expected cash, low stock and follow-ups are visible in one view.',
  },
  {
    title: 'Closing is controlled',
    desc: 'Cash sales, supplier payments, refunds and till expenses roll into expected cash.',
  },
];

export const GHANA_REALITY_BULLETS = [
  'Cash and MoMo at the till',
  'Credit customers',
  'Supplier payments',
  'Expenses paid from till',
  'Staff shifts',
  'Expected cash',
  'Offline-ready selling',
  'Stock in pieces, packs and cartons',
] as const;

export const TESTIMONIALS = [
  {
    title: 'Offline selling stayed calm',
    quote:
      'The network went off. TillFlow did not. We sold normally, and everything synced on its own when the network came back.',
  },
  {
    title: 'Closing became easier',
    quote:
      'We see what cash is expected to be there, and we close shifts with comments for any variance — which the owner sees.',
  },
  {
    title: 'Profit got clearer',
    quote:
      'It was difficult to track profitable products as we grew past 1,000 products. TillFlow made those decisions much easier.',
  },
] as const;

export const ROLE_CARDS = [
  {
    role: 'Cashier',
    desc: 'Sell and see own sales',
  },
  {
    role: 'Manager',
    desc: 'Stock, purchases and reports',
  },
  {
    role: 'Owner',
    desc: 'Money, staff and control',
  },
] as const;

export const FEATURE_LIST = [
  'Fast POS',
  'Stock control',
  'Cash and MoMo',
  'Credit and debtors',
  'Suppliers and purchases',
  'Expenses',
  'Cash drawer and shifts',
  'Owner reports',
  'Staff roles',
  'Offline-ready',
] as const;
