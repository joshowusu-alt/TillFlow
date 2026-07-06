export const WELCOME_HEADLINE = 'Sell fast. Track stock. Know your money.';

export const WELCOME_SUBHEADLINE =
  'TillFlow helps Ghanaian retail businesses sell at the counter, track stock, manage cash and MoMo, follow up credit and suppliers, and see clear owner reports — even when the internet is unreliable.';

export const TRUST_BADGES = [
  'Offline-ready selling',
  'Cash, MoMo & credit',
  'Daily owner reports',
  'Built for Ghana',
] as const;

export const BUSINESS_TYPES = [
  'Supermarkets',
  'Mini marts',
  'Pharmacies',
  'Wholesalers',
  'Provision shops',
  'Warehouses',
  'Beauty supply stores',
] as const;

export const PRODUCT_PROOF: Array<{
  title: string;
  desc: string;
  image: string;
  alt: string;
  imageClassName?: string;
}> = [
  {
    title: 'Sell at the counter',
    desc: 'Fast sales at the counter, even when the network is unreliable.',
    image: '/marketing/pos-checkout.png',
    alt: 'TillFlow POS checkout with cart, cash tendered and change due',
  },
  {
    title: "Know today's money",
    desc: "See today's sales, profit, cash and stock alerts clearly.",
    image: '/marketing/owner-dashboard.png',
    alt: 'TillFlow owner command center with revenue, expected cash and follow-up tasks',
  },
  {
    title: 'Close with confidence',
    desc: 'Track cash in, cash out, expenses, supplier payments and expected cash.',
    image: '/marketing/owner-dashboard.png',
    imageClassName: 'object-[center_20%]',
    alt: 'TillFlow shift close view with expected cash and items needing attention',
  },
  {
    title: 'Track growth',
    desc: 'See revenue trends, margins, top products and peak trading hours.',
    image: '/marketing/trend-analytics.png',
    alt: 'TillFlow trend analytics with revenue, gross profit and category breakdown',
  },
  {
    title: 'Manage relationships',
    desc: 'Keep customers, suppliers, receipts and payables connected in one place.',
    image: '/marketing/people-relationships.png',
    alt: 'TillFlow People page for customers, suppliers and payment follow-up',
  },
];

export const GHANA_REALITY_BULLETS = [
  'Cash and MoMo at the till',
  'Credit customers and follow-up',
  'Supplier payments and payables',
  'Expenses paid from the till',
  'Staff shifts and expected cash',
  'Offline selling when the network drops',
  'Stock in pieces, packs and cartons',
] as const;

export const TESTIMONIALS = [
  {
    title: 'Offline selling stayed calm',
    quote:
      'The network went off. TillFlow did not. We sold normally, and once the network was back everything synced on its own without any issues.',
  },
  {
    title: 'Closing business became easier',
    quote:
      'TillFlow helps in closing business easily. We have shifts, we see what is expected to be there, and we close with comments for any positive or negative variance which the owner sees.',
  },
  {
    title: 'Profit visibility improved decisions',
    quote:
      'We have seen profitable products more clearly. It was difficult to keep track as the business grew to over 1,000 products, but TillFlow has been a rock where sound decisions have been made.',
  },
] as const;

export const ROLE_CARDS = [
  {
    role: 'Cashier',
    items: ['Sell at POS', 'See My Sales', 'View My Shift', 'No access to products, reports or settings'],
  },
  {
    role: 'Manager',
    items: [
      'POS, sales and inventory',
      'Purchases and suppliers',
      'Reports and corrections',
      'Returns where allowed',
    ],
  },
  {
    role: 'Owner',
    items: [
      'Money, reports and staff',
      'Cash drawer and shift control',
      'Settings and billing',
      'Control across the business',
    ],
  },
] as const;

export const HOW_IT_WORKS = [
  { step: '01', title: 'Create account', desc: 'Enter your business name, local currency, and go.' },
  { step: '02', title: 'Add products', desc: 'Type or scan products. Set prices, units and categories.' },
  { step: '03', title: 'Start selling', desc: 'Open the POS, scan items and collect payment.' },
  { step: '04', title: 'Track money and stock', desc: 'Follow cash, MoMo, credit, suppliers and stock movement.' },
] as const;

export const FEATURE_GRID = [
  { title: 'Fast POS', desc: 'Scan, search and complete sales without slowing the queue.' },
  { title: 'Stock control', desc: 'Track pieces, packs and cartons across the stockroom.' },
  { title: 'Cash and MoMo', desc: 'Record cash, mobile money and mixed payments at the till.' },
  { title: 'Credit and debtors', desc: 'Track customer balances and follow up payments.' },
  { title: 'Suppliers and purchases', desc: 'Record deliveries, costs and supplier payments.' },
  { title: 'Expenses', desc: 'Track operating costs and cash paid from the till.' },
  { title: 'Cash drawer and shifts', desc: 'Open the till, track expected cash and close with clarity.' },
  { title: 'Owner reports', desc: 'See revenue, profit, margins and daily performance.' },
  { title: 'Staff roles', desc: 'Owner, manager and cashier access that matches real teams.' },
  { title: 'Offline-ready', desc: 'Keep selling through unstable internet, then sync automatically.' },
  { title: 'Install on any device', desc: 'Works on phone, tablet and laptop as a fast full-screen app.' },
] as const;
