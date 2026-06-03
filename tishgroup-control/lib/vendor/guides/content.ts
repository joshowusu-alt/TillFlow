export type GuideSection = {
  title: string;
  steps: string[];
};

export type GuideDoc = {
  slug: string;
  title: string;
  subtitle: string;
  audience: 'owner' | 'cashier' | 'setup' | 'units' | 'agent';
  sections: GuideSection[];
};

export const GUIDES: GuideDoc[] = [
  {
    slug: 'owner',
    title: 'Owner Guide: Know what is happening in your business',
    subtitle: 'Daily checks every owner should do in TillFlow.',
    audience: 'owner',
    sections: [
      {
        title: "Today's sales",
        steps: [
          'Open Reports → Dashboard (or Owner report).',
          'Check today’s revenue and number of transactions.',
          'Compare cash, MoMo and credit — does it match what you expect at the till?',
        ],
      },
      {
        title: 'Money you should expect',
        steps: [
          'See expected cash and MoMo totals for the day.',
          'Check debtor balance — who still owes you from credit sales.',
          'Check supplier payable — who you still owe.',
        ],
      },
      {
        title: 'Stock alerts',
        steps: [
          'Open low-stock list or inventory report.',
          'Reorder items that are running out before you lose sales.',
        ],
      },
      {
        title: 'Top products',
        steps: [
          'View top sellers for the week.',
          'Promote winners and fix slow movers (price, placement, stock).',
        ],
      },
      {
        title: 'What needs attention',
        steps: [
          'Red flags: no sales today, trial ending, overdue payment, open support ticket.',
          'Use the setup banner on the home screen — it tells you the next step.',
        ],
      },
    ],
  },
  {
    slug: 'cashier',
    title: 'Cashier Guide: How to sell with TillFlow',
    subtitle: 'Simple steps for busy counters.',
    audience: 'cashier',
    sections: [
      {
        title: 'Sell a item',
        steps: [
          'Open POS.',
          'Search product name or scan barcode.',
          'Tap product → set quantity.',
          'Repeat for each item in the basket.',
        ],
      },
      {
        title: 'Take payment',
        steps: [
          'Choose Cash, MoMo, Card or Credit (if allowed).',
          'For credit, select the customer.',
          'Tap Complete sale.',
          'Print or share receipt if needed.',
        ],
      },
      {
        title: 'If internet is slow',
        steps: [
          'Keep selling — TillFlow can work offline.',
          'Do not refresh the page during a sale.',
          'Sync happens when connection returns.',
        ],
      },
      {
        title: 'Do not',
        steps: [
          'Do not sell without selecting payment type.',
          'Do not guess prices — search the correct product.',
          'Do not share your login with customers.',
        ],
      },
    ],
  },
  {
    slug: 'setup',
    title: 'Setup Guide: Start properly with TillFlow',
    subtitle: 'Matches the 12-step “Start properly” journey.',
    audience: 'setup',
    sections: [
      {
        title: 'Business & staff',
        steps: [
          'Complete business name, phone and address in Settings.',
          'Add cashiers and managers under Users — give each their own login.',
        ],
      },
      {
        title: 'Products & stock',
        steps: [
          'Add products manually or import from Settings → Import stock.',
          'Use the Ghana-friendly template if you have many items.',
          'Record opening stock so quantities are correct on day one.',
        ],
      },
      {
        title: 'Payments & first sale',
        steps: [
          'Enable MoMo and other methods in Settings if you use them.',
          'Make one test sale at POS and check the receipt.',
          'Open Reports dashboard — confirm the sale appears.',
        ],
      },
    ],
  },
  {
    slug: 'units',
    title: 'Unit Guide: Pieces, packs and cartons',
    subtitle: 'Get units right — common mistake in Ghana retail.',
    audience: 'units',
    sections: [
      {
        title: 'Common units',
        steps: [
          'Piece — one item sold individually.',
          'Pack — fixed bundle (e.g. 6 bottles).',
          'Carton — large case; set conversion if you sell singles from it.',
          'Bottle, tin, strip, sachet — use what matches the shelf.',
          'Kg — for rice, flour, sugar sold by weight (if enabled).',
        ],
      },
      {
        title: 'Examples',
        steps: [
          'Carton of 24 pieces: base unit = piece, conversion on pack/carton = 24.',
          'Sell one bottle at a time → selling unit = bottle (piece).',
          'Medicine by strip → use strip as unit.',
          'Rice by kg → use kg and weigh at sale if supported.',
        ],
      },
      {
        title: 'Rule of thumb',
        steps: [
          'Stock is always stored in the base unit.',
          'If unsure, start with piece and adjust after your first stocktake.',
        ],
      },
    ],
  },
  {
    slug: 'agent',
    title: 'Agent Demo Talking Points',
    subtitle: 'For Tish Group sales — keep it under 5 minutes.',
    audience: 'agent',
    sections: [
      {
        title: '60-second pitch',
        steps: [
          'TillFlow is POS + stock + payments + owner reports for Ghana shops.',
          'Works offline. Cash, MoMo and credit in one place.',
          'Owner sees profit and low stock without end-of-day maths.',
        ],
      },
      {
        title: 'What to show first',
        steps: [
          'Demo dashboard — today’s money.',
          'Try a sample sale at /demo/try-sale.',
          'Show low stock and top products.',
          'Optional: online store sample orders.',
        ],
      },
      {
        title: 'Close the demo',
        steps: [
          'Ask: “How do you track stock and debtors today?”',
          'Recommend Starter for one counter, Growth for reports, Pro for multi-branch.',
          'Send trial link and book setup call.',
        ],
      },
      {
        title: 'Common objections',
        steps: [
          '“Too busy” → start with products + opening stock only; we help import.',
          '“Staff will mess up” → separate logins and simple cashier guide.',
          '“Internet bad” → offline POS, sync later.',
        ],
      },
    ],
  },
];

export function getGuide(slug: string) {
  return GUIDES.find((g) => g.slug === slug) ?? null;
}
