export type WhatsAppTemplateVars = {
  businessName?: string;
  ownerName?: string;
  plan?: string;
  trialEndDate?: string;
  amount?: string;
  agentName?: string;
  demoLink?: string;
  supportNumber?: string;
};

export type WhatsAppTemplate = {
  id: string;
  title: string;
  category: 'sales' | 'onboarding' | 'support' | 'billing' | 'referral';
  body: string;
};

export const WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: 'new-lead',
    title: 'New lead intro',
    category: 'sales',
    body: `Hi {ownerName}, this is {agentName} from Tish Group.

TillFlow helps shops and supermarkets sell fast, track stock, and see daily sales & profit — even when internet is slow.

Would you like a quick demo for {businessName}?`,
  },
  {
    id: 'demo-booking',
    title: 'Demo booking',
    category: 'sales',
    body: `Hi {ownerName}, your TillFlow demo for {businessName} is booked.

We will walk through POS, stock and owner reports. Join here when ready: {demoLink}

Reply on this number if you need to reschedule.`,
  },
  {
    id: 'after-demo',
    title: 'After demo',
    category: 'sales',
    body: `Hi {ownerName}, thanks for viewing the TillFlow demo today.

Start your 7-day trial here: {demoLink}
Pick {plan} or we can help you choose on a quick call.`,
  },
  {
    id: 'trial-started',
    title: 'Trial started',
    category: 'onboarding',
    body: `Welcome {ownerName}! {businessName} is on TillFlow trial.

First steps:
1) Add products (or import your list)
2) Add opening stock
3) Make one test sale
4) Check today’s report

Need help? WhatsApp {supportNumber}`,
  },
  {
    id: 'import-request',
    title: 'Product import request',
    category: 'onboarding',
    body: `Hi {ownerName}, please send your product list (Excel or the TillFlow template) for {businessName}.

We will help you import and set opening stock. Reply here or WhatsApp {supportNumber}.`,
  },
  {
    id: 'first-sale',
    title: 'First sale guidance',
    category: 'onboarding',
    body: `Cashier tip for {businessName}:
Search product → add qty → choose Cash / MoMo / Credit → Complete sale → give receipt.

Practice once before busy hours. Questions? {supportNumber}`,
  },
  {
    id: 'trial-ending',
    title: 'Trial ending soon',
    category: 'billing',
    body: `Hi {ownerName}, your TillFlow trial for {businessName} ends {trialEndDate}.

To keep selling without interruption, plan payment is {amount}/month. Reply here and we will confirm MoMo or bank details.`,
  },
  {
    id: 'payment-due',
    title: 'Payment due today',
    category: 'billing',
    body: `Hi {ownerName}, TillFlow payment for {businessName} is due today ({amount}).

Send MoMo to our TillFlow number and share the reference. We will activate immediately.`,
  },
  {
    id: 'support-ack',
    title: 'Support acknowledgement',
    category: 'support',
    body: `Hi {ownerName}, we received your request for {businessName}. {agentName} is looking into it and will update you shortly.`,
  },
  {
    id: 'issue-resolved',
    title: 'Issue resolved',
    category: 'support',
    body: `Hi {ownerName}, your TillFlow issue for {businessName} is resolved. Please try again and tell us if anything still looks wrong.`,
  },
  {
    id: 'referral-intro',
    title: 'Referral message',
    category: 'referral',
    body: `Hi, I am introducing {businessName} (contact: {ownerName}) to TillFlow — POS, stock and reports for Ghana shops.

Tish Group can show a short demo: {demoLink}`,
  },
];

export function applyTemplateVars(body: string, vars: WhatsAppTemplateVars) {
  const defaults: WhatsAppTemplateVars = {
    businessName: 'your shop',
    ownerName: 'there',
    plan: 'Growth',
    trialEndDate: 'soon',
    amount: 'GH₵349',
    agentName: 'Tish Group',
    demoLink: 'https://tillflow.app/demo',
    supportNumber: '0200-000-000',
  };
  const merged = { ...defaults, ...vars };
  return body.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = merged[key as keyof WhatsAppTemplateVars];
    return v != null ? String(v) : `{${key}}`;
  });
}
