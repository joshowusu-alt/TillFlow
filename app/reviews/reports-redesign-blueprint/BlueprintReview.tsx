'use client';

import { useState, type ReactNode } from 'react';

type Width = 320 | 390 | 768 | 1180;
type Plan = 'starter' | 'growth' | 'pro';
type Role = 'owner' | 'manager' | 'cashier';
type Shops = 'single' | 'multi';
type Scope = 'branch' | 'all' | 'pick';
type Scene = 'healthy' | 'attention' | 'empty' | 'restricted' | 'cancelled' | 'loading' | 'error';
type Screen = 'today' | 'activity' | 'more' | 'money' | 'trading' | 'statement' | 'downloads' | 'oversight';

const WIDTHS: Width[] = [320, 390, 768, 1180];
const PLANS: Plan[] = ['starter', 'growth', 'pro'];
const ROLES: Role[] = ['owner', 'manager', 'cashier'];
const SCENES: Scene[] = ['healthy', 'attention', 'empty', 'restricted', 'cancelled', 'loading', 'error'];
const PAGES: { id: Screen; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'activity', label: 'Activity' },
  { id: 'more', label: 'More' },
  { id: 'statement', label: 'Income statement' },
  { id: 'money', label: 'Money received' },
  { id: 'trading', label: 'Trading' },
];

function ghs(amount: number) {
  const sign = amount < 0 ? '−' : '';
  const formatted = Math.abs(amount).toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}GHS ${formatted}`;
}

function planLabel(plan: Plan) {
  if (plan === 'starter') return 'Starter';
  if (plan === 'growth') return 'Growth';
  return 'Pro';
}

type Attention = {
  id: string;
  title: string;
  detail: string;
  action: string;
  tone: 'high' | 'medium';
};

function attentionItems(plan: Plan, consolidated: boolean): Attention[] {
  const branch = consolidated ? 'Kaneshie' : 'Madina';
  const ranked: Array<Attention & { rank: number; plans: Plan[] }> = [
    {
      rank: 1,
      plans: ['starter', 'growth', 'pro'],
      id: 'open-shift',
      tone: 'high',
      title: 'Main till is still open from yesterday',
      detail: `${branch} · not counted yet`,
      action: 'Review shift',
    },
    {
      rank: 2,
      plans: ['starter', 'growth', 'pro'],
      id: 'cash',
      tone: 'high',
      title: `Cash is ${ghs(consolidated ? 20 : 35)} short`,
      detail: `${branch} · Main till · closed 1:40 pm`,
      action: 'Review shift',
    },
    {
      rank: 3,
      plans: ['starter', 'growth', 'pro'],
      id: 'momo',
      tone: 'high',
      title: '3 Mobile Money payments need confirmation',
      detail: `${ghs(420)} · not in money received`,
      action: 'Confirm',
    },
    {
      rank: 4,
      plans: ['starter', 'growth', 'pro'],
      id: 'network',
      tone: 'medium',
      title: '2 collections are pending with the network',
      detail: 'Provider queue · separate from confirmation',
      action: 'Review',
    },
    {
      rank: 5,
      plans: ['starter', 'growth', 'pro'],
      id: 'customers',
      tone: 'medium',
      title: `${ghs(680)} from customers is past the due date`,
      detail: 'Credit that is not yet due stays off this list',
      action: 'Review',
    },
    {
      rank: 6,
      plans: ['starter', 'growth', 'pro'],
      id: 'suppliers',
      tone: 'medium',
      title: `${ghs(1150)} to suppliers is past the due date`,
      detail: 'Not every open purchase',
      action: 'Review',
    },
    {
      rank: 7,
      plans: ['growth', 'pro'],
      id: 'cost',
      tone: 'medium',
      title: 'Gino tomato mix sold below its cost',
      detail: `Today · ${branch} · cost is recorded`,
      action: 'See product',
    },
    {
      rank: 8,
      plans: ['starter', 'growth', 'pro'],
      id: 'stock',
      tone: 'medium',
      title: 'Peak milk 400g may run out',
      detail: '4 left',
      action: plan === 'starter' ? 'Open inventory' : 'Reorder',
    },
  ];
  return ranked
    .filter((item) => item.plans.includes(plan))
    .sort((a, b) => a.rank - b.rank || (a.tone === b.tone ? 0 : a.tone === 'high' ? -1 : 1))
    .slice(0, 5);
}

const WEEK = [
  { day: 'Thu 24', amount: 1820 },
  { day: 'Fri 25', amount: 2040 },
  { day: 'Sat 26', amount: 960 },
  { day: 'Sun 27', amount: 3100 },
  { day: 'Mon 28', amount: 2740 },
  { day: 'Tue 29', amount: 4210 },
  { day: 'Wed 30', amount: 4860 },
];

const BRANCHES = [
  { name: 'Madina', sales: 4860 },
  { name: 'Kaneshie', sales: 7210 },
  { name: 'Kejetia', sales: 6360 },
];

const PRODUCTS = [
  { name: 'Indomie chicken 70g', amount: 640, qty: 80 },
  { name: 'Peak milk 400g', amount: 520, qty: 26 },
  { name: 'Voltic water 750ml', amount: 410, qty: 82 },
];

export default function BlueprintReview() {
  const [width, setWidth] = useState<Width>(390);
  const [plan, setPlan] = useState<Plan>('starter');
  const [role, setRole] = useState<Role>('owner');
  const [shops, setShops] = useState<Shops>('multi');
  const [scope, setScope] = useState<Scope>('branch');
  const [scene, setScene] = useState<Scene>('healthy');
  const [screen, setScreen] = useState<Screen>('today');
  const [storefront, setStorefront] = useState(false);
  const [costsMissing, setCostsMissing] = useState(false);
  const [help, setHelp] = useState<string | null>(null);
  const [updated, setUpdated] = useState('2:14 pm');

  const desktop = width >= 1024;
  const consolidated = plan === 'pro' && scope === 'all' && shops === 'multi';
  const scopeText = consolidated ? 'Consolidated — all branches' : 'Madina';

  return (
    <div className="min-h-screen bg-slate-100 text-ink">
      <section className="border-b border-slate-200 bg-white px-4 py-3" aria-label="Review controls">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Review controls · not part of the customer screen
        </p>
        <div className="mt-2 space-y-2">
          <ControlRow label="Width">
            {WIDTHS.map((item) => (
              <Choice key={item} current={String(width)} value={String(item)} onSelect={() => setWidth(item)}>
                {item === 768 ? 'Tablet' : item === 1180 ? 'Desktop' : `${item}`}
              </Choice>
            ))}
          </ControlRow>
          <ControlRow label="Plan">
            {PLANS.map((item) => (
              <Choice key={item} current={plan} value={item} onSelect={setPlan}>{planLabel(item)}</Choice>
            ))}
          </ControlRow>
          <ControlRow label="Person">
            {ROLES.map((item) => (
              <Choice key={item} current={role} value={item} onSelect={setRole}>
                {item[0].toUpperCase() + item.slice(1)}
              </Choice>
            ))}
          </ControlRow>
          <ControlRow label="Shops">
            <Choice current={shops} value="single" onSelect={setShops}>One branch</Choice>
            <Choice current={shops} value="multi" onSelect={setShops}>Three branches</Choice>
          </ControlRow>
          <ControlRow label="Scope">
            <Choice current={scope} value="branch" onSelect={setScope}>Madina</Choice>
            <Choice current={scope} value="all" onSelect={setScope}>All branches</Choice>
            <Choice current={scope} value="pick" onSelect={setScope}>No selection</Choice>
          </ControlRow>
          <ControlRow label="State">
            {SCENES.map((item) => (
              <Choice key={item} current={scene} value={item} onSelect={setScene}>
                {item[0].toUpperCase() + item.slice(1)}
              </Choice>
            ))}
          </ControlRow>
          <ControlRow label="Page">
            {PAGES.map((item) => (
              <Choice key={item.id} current={screen} value={item.id} onSelect={setScreen}>{item.label}</Choice>
            ))}
          </ControlRow>
          <ControlRow label="Extras">
            <Choice current={storefront ? 'on' : 'off'} value="off" onSelect={() => setStorefront(false)}>Storefront off</Choice>
            <Choice current={storefront ? 'on' : 'off'} value="on" onSelect={() => setStorefront(true)}>Storefront on</Choice>
            <Choice current={costsMissing ? 'missing' : 'known'} value="known" onSelect={() => setCostsMissing(false)}>Costs recorded</Choice>
            <Choice current={costsMissing ? 'missing' : 'known'} value="missing" onSelect={() => setCostsMissing(true)}>Costs missing</Choice>
          </ControlRow>
        </div>
      </section>

      <div className="overflow-x-auto px-3 py-6 sm:px-6">
        <div className="mx-auto overflow-hidden rounded-2xl border border-slate-200 bg-paper shadow-floating" style={{ width }}>
          <CustomerApp
            desktop={desktop}
            plan={plan}
            role={role}
            shops={shops}
            scope={scope}
            scene={scene}
            screen={screen}
            storefront={storefront}
            costsMissing={costsMissing}
            consolidated={consolidated}
            scopeText={scopeText}
            help={help}
            updated={updated}
            onScreen={setScreen}
            onScope={setScope}
            onHelp={setHelp}
            onRefresh={() => setUpdated('2:15 pm')}
          />
        </div>
      </div>
    </div>
  );
}

function ControlRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Choice<T extends string>({
  current,
  value,
  onSelect,
  children,
}: {
  current: T;
  value: T;
  onSelect: (value: T) => void;
  children: ReactNode;
}) {
  const selected = current === value;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(value)}
      className={`min-h-9 rounded-full px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
        selected ? 'bg-ink text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
      }`}
    >
      {children}
    </button>
  );
}

function CustomerApp(props: {
  desktop: boolean;
  plan: Plan;
  role: Role;
  shops: Shops;
  scope: Scope;
  scene: Scene;
  screen: Screen;
  storefront: boolean;
  costsMissing: boolean;
  consolidated: boolean;
  scopeText: string;
  help: string | null;
  updated: string;
  onScreen: (screen: Screen) => void;
  onScope: (scope: Scope) => void;
  onHelp: (help: string | null) => void;
  onRefresh: () => void;
}) {
  return (
    <div className={`flex min-h-[720px] flex-col ${props.desktop ? '' : 'min-h-[844px]'}`}>
      <AppHeader plan={props.plan} role={props.role} desktop={props.desktop} />
      <div className={props.desktop ? 'flex min-h-0 flex-1' : 'flex min-h-0 flex-1 flex-col'}>
        {props.desktop && props.role !== 'cashier' && props.scene !== 'cancelled' ? (
          <SideNav {...props} />
        ) : null}
        <main id="report-preview" className={`min-w-0 flex-1 px-3 py-3 ${props.desktop ? 'px-5 py-4' : ''}`}>
          <ScreenBody {...props} />
        </main>
      </div>
      {!props.desktop && props.role !== 'cashier' && props.scene !== 'cancelled' ? (
        <BottomNav screen={props.screen} onScreen={props.onScreen} />
      ) : null}
    </div>
  );
}

function AppHeader({ plan, role, desktop }: { plan: Plan; role: Role; desktop: boolean }) {
  const person = role === 'cashier' ? 'Cashier' : role === 'manager' ? 'Manager' : 'Owner';
  return (
    <header className="border-b border-slate-200/80 bg-white">
      <div className={`flex items-center justify-between gap-3 px-3 py-2.5 ${desktop ? 'px-4' : ''}`}>
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white" aria-hidden="true">T</span>
          <span className="font-display text-lg font-semibold tracking-tight text-accent">TillFlow</span>
        </div>
        <p className="truncate text-right text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-success" aria-hidden="true" />
          {person} · {planLabel(plan)}
        </p>
      </div>
      <div className={`flex items-center gap-2 px-3 pb-2.5 ${desktop ? 'px-4' : ''}`}>
        <span className="inline-flex min-h-8 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-ink">Ama’s Provisions</span>
        <span className="inline-flex min-h-8 items-center rounded-full bg-emerald-100 px-3 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Sample</span>
      </div>
    </header>
  );
}

function SideNav(props: {
  plan: Plan;
  role: Role;
  storefront: boolean;
  screen: Screen;
  onScreen: (screen: Screen) => void;
}) {
  const items: { id: Screen; label: string; show: boolean }[] = [
    { id: 'today', label: 'Today', show: true },
    { id: 'activity', label: 'Activity', show: true },
    { id: 'statement', label: 'Income statement', show: props.plan !== 'starter' },
    { id: 'downloads', label: 'Downloads', show: true },
    { id: 'oversight', label: 'Oversight', show: props.plan === 'pro' && props.role === 'owner' },
    { id: 'activity', label: 'Storefront', show: props.storefront && props.plan !== 'starter' },
  ];
  return (
    <nav aria-label="Reports" className="w-56 shrink-0 border-r border-slate-200/80 bg-white px-2 py-3">
      <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Reports</p>
      <div className="space-y-0.5">
        {items.filter((item) => item.show).map((item) => {
          const active = props.screen === item.id || (item.label === 'Storefront' && props.screen === 'activity');
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => props.onScreen(item.id)}
              className={`shell-nav-link min-h-11 w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${active ? 'shell-nav-link-active' : ''}`}
            >
              <span className="flex items-center gap-2">
                <Mark />
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function BottomNav({ screen, onScreen }: { screen: Screen; onScreen: (screen: Screen) => void }) {
  const tabs: { id: Screen; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'activity', label: 'Activity' },
    { id: 'more', label: 'More' },
  ];
  const selected = screen === 'today' ? 'today' : screen === 'activity' || screen === 'money' || screen === 'trading' ? 'activity' : 'more';
  return (
    <nav aria-label="Reports" className="grid grid-cols-3 border-t border-slate-200 bg-white">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onScreen(tab.id)}
          className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
            selected === tab.id ? 'text-accent' : 'text-slate-500'
          }`}
        >
          <Mark />
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

function Mark() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  );
}

function ScreenBody(props: {
  plan: Plan;
  role: Role;
  shops: Shops;
  scope: Scope;
  scene: Scene;
  screen: Screen;
  storefront: boolean;
  costsMissing: boolean;
  consolidated: boolean;
  scopeText: string;
  help: string | null;
  updated: string;
  desktop: boolean;
  onScreen: (screen: Screen) => void;
  onScope: (scope: Scope) => void;
  onHelp: (help: string | null) => void;
  onRefresh: () => void;
}) {
  if (props.role === 'cashier') {
    return (
      <StatusPanel
        tone="neutral"
        title="Reports are not on this sign-in"
        body="Cashiers use the till. Ask an owner or manager if you need a report."
        action="Open the till"
      />
    );
  }
  if (props.scene === 'cancelled') {
    return (
      <StatusPanel
        tone="alert"
        title="This account is closed"
        body="Reports stay unavailable until the subscription is active again."
        action="Review billing"
      />
    );
  }

  const operational = props.screen !== 'statement' && props.screen !== 'downloads' && props.screen !== 'oversight';
  const blocked = props.scope === 'all' && props.plan !== 'pro' && props.shops === 'multi' && operational;
  const picking = props.scope === 'pick' && props.shops === 'multi' && operational;

  return (
    <div>
      {props.scene === 'restricted' ? (
        <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium leading-5 text-amber-900">
          Read-only. You can look at reports. Downloads and changes stay off until billing is sorted.
        </p>
      ) : null}
      {picking ? (
        <BranchPicker shops={props.shops} onScope={props.onScope} />
      ) : blocked ? (
        <StatusPanel
          tone="neutral"
          title="All branches is part of Pro"
          body="This plan reports on one branch. No combined total is shown."
          action="View Madina"
          onAction={() => props.onScope('branch')}
        />
      ) : props.screen === 'today' ? (
        <TodayScreen {...props} />
      ) : props.screen === 'activity' ? (
        <ActivityScreen {...props} />
      ) : props.screen === 'more' ? (
        <MoreScreen {...props} />
      ) : props.screen === 'money' ? (
        <MoneyScreen {...props} />
      ) : props.screen === 'trading' ? (
        <TradingScreen {...props} />
      ) : props.screen === 'statement' ? (
        <StatementScreen {...props} />
      ) : props.screen === 'downloads' ? (
        <DownloadsScreen {...props} />
      ) : (
        <OversightScreen {...props} />
      )}
      {props.help ? <HelpDrawer title={props.help} onClose={() => props.onHelp(null)} /> : null}
    </div>
  );
}

function PageHead({
  title,
  scope,
  updated,
  onRefresh,
  onHelp,
  accounting,
}: {
  title: string;
  scope: string;
  updated: string;
  onRefresh: () => void;
  onHelp?: () => void;
  accounting?: boolean;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold leading-tight">{title}</h1>
        <button type="button" onClick={onRefresh} className="btn-ghost min-h-11 shrink-0 px-3 text-xs">Refresh</button>
      </div>
      <p className="mt-1 text-sm leading-5 text-slate-600">
        Wednesday 30 September 2026 · <abbr title="Shop timezone Africa/Accra" className="cursor-help no-underline">Local time</abbr>
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex max-w-full items-center rounded-full bg-accentSoft px-3 py-1 text-sm font-semibold leading-5 text-blue-900">
          {accounting ? 'Whole business — not separated by branch' : scope}
        </p>
        <p className="text-xs text-slate-600">Updated {updated}</p>
      </div>
      {onHelp ? (
        <button type="button" onClick={onHelp} className="mt-1 min-h-11 text-sm font-semibold text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          What is this?
        </button>
      ) : null}
    </div>
  );
}

function TodayScreen(props: {
  plan: Plan;
  scene: Scene;
  consolidated: boolean;
  scopeText: string;
  updated: string;
  desktop: boolean;
  onScreen: (screen: Screen) => void;
  onHelp: (help: string | null) => void;
  onRefresh: () => void;
}) {
  if (props.scene === 'loading') {
    return (
      <div>
        <PageHead title="Today" scope={props.scopeText} updated={props.updated} onRefresh={props.onRefresh} />
        <div aria-busy="true" aria-live="polite" className="card p-4">
          <p className="text-sm font-semibold">Loading today’s figures</p>
          <div className="mt-3 h-8 w-40 rounded-lg bg-slate-200 motion-reduce:animate-none animate-pulse" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="h-14 rounded-lg bg-slate-100" />
            <div className="h-14 rounded-lg bg-slate-100" />
          </div>
        </div>
      </div>
    );
  }
  if (props.scene === 'error') {
    return (
      <div>
        <PageHead title="Today" scope={props.scopeText} updated={props.updated} onRefresh={props.onRefresh} />
        <StatusPanel
          tone="alert"
          title="Today could not be loaded"
          body="Check the connection and try again. No figures are shown in their place."
          action="Try again"
          onAction={props.onRefresh}
        />
      </div>
    );
  }
  if (props.scene === 'empty') return <EmptyToday {...props} />;

  const sales = props.consolidated ? 18430 : 4860;
  const received = props.consolidated ? 16920 : 4210;
  const attention = props.scene === 'attention';
  const difference = attention ? (props.consolidated ? -20 : -35) : -2;
  const week = props.consolidated ? WEEK.map((bar) => ({ ...bar, amount: Math.round(bar.amount * 3.6) })) : WEEK;
  const max = Math.max(...week.map((bar) => bar.amount));

  return (
    <div>
      <PageHead
        title="Today"
        scope={props.scopeText}
        updated={props.updated}
        onRefresh={props.onRefresh}
        onHelp={() => props.onHelp('Sales today')}
      />
      <section className="card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sales today</p>
        <p className="mt-1 font-display text-[1.85rem] font-semibold leading-none tabular-nums">{ghs(sales)}</p>
        <p className="mt-2 text-sm text-slate-600">{props.consolidated ? '86 sales' : '42 sales'} · yesterday {ghs(props.consolidated ? 17040 : 4120)}</p>
        <button type="button" className="mt-1 min-h-11 text-sm font-semibold text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" onClick={() => props.onScreen('trading')}>Open trading</button>
        <div className={`mt-3 grid gap-2 border-t border-slate-100 pt-3 ${props.desktop ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <button type="button" onClick={() => props.onScreen('money')} className="rounded-xl bg-slate-50 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Money received today</span>
            <span className="mt-1 block font-display text-xl font-semibold tabular-nums">{ghs(received)}</span>
            <span className="mt-1 block text-xs text-slate-600">Confirmed · cash, MoMo, transfer</span>
          </button>
          <button type="button" onClick={() => props.onHelp('Cash difference today')} className={`rounded-xl px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${Math.abs(difference) >= 5 ? 'bg-amber-50' : 'bg-slate-50'}`}>
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Cash difference today</span>
            <span className="mt-1 block font-display text-xl font-semibold tabular-nums">{ghs(difference)}</span>
            <span className="mt-1 block text-xs text-slate-600">{Math.abs(difference) >= 5 ? 'Needs a look · closed tills' : 'Within GHS 5 · closed tills'}</span>
          </button>
        </div>
      </section>

      <section className="mt-3" aria-label="Needs attention">
        <h2 className="font-display text-base font-semibold">Needs attention</h2>
        {attention ? (
          <ul className="mt-2 space-y-2">
            {attentionItems(props.plan, props.consolidated).map((item) => (
              <li key={item.id}>
                <button type="button" className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-left shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold uppercase ${item.tone === 'high' ? 'bg-rose-50 text-rose-800' : 'bg-amber-50 text-amber-800'}`}>
                    {item.tone === 'high' ? 'High' : 'Check'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-5">{item.title}</span>
                    <span className="block text-xs leading-5 text-slate-600">{item.detail}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-accent">{item.action}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 flex min-h-11 items-center gap-2 rounded-xl border border-emerald-100 bg-white px-3 text-sm text-ink shadow-card">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800" aria-hidden="true">OK</span>
            Nothing needs attention right now.
          </p>
        )}
      </section>

      <section className={`mt-4 ${props.desktop ? 'grid grid-cols-2 gap-3' : 'space-y-3'}`}>
        <div className="card p-3">
          <h2 className="text-sm font-semibold">Sales, last 7 days</h2>
          <p className="text-xs text-slate-500">Thu 24 Sep – Wed 30 Sep · shop dates</p>
          <ul className="mt-2 space-y-1.5">
            {week.map((bar) => (
              <li key={bar.day} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-xs">
                <span className="font-semibold">{bar.day}</span>
                <span className="h-2 rounded-full bg-accentSoft">
                  <span className="block h-2 rounded-full bg-accent" style={{ width: `${Math.max(8, (bar.amount / max) * 100)}%` }} />
                </span>
                <span className="tabular-nums">{ghs(bar.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-3">
          <div className="card p-3">
            <h2 className="text-sm font-semibold">How money came in</h2>
            <div className="mt-2 flex h-2.5 overflow-hidden rounded-full" aria-hidden="true">
              <div className="bg-accent" style={{ width: '51%' }} />
              <div className="bg-emerald-600" style={{ width: '44%' }} />
              <div className="bg-amber-600" style={{ width: '5%' }} />
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              <li className="flex justify-between"><span>Cash</span><span className="font-semibold tabular-nums">{ghs(props.consolidated ? 8640 : 2140)}</span></li>
              <li className="flex justify-between"><span>Mobile Money</span><span className="font-semibold tabular-nums">{ghs(props.consolidated ? 7420 : 1870)}</span></li>
              <li className="flex justify-between"><span>Bank transfer</span><span className="font-semibold tabular-nums">{ghs(props.consolidated ? 860 : 200)}</span></li>
            </ul>
          </div>
          {props.plan !== 'starter' ? (
            <div className="card p-3">
              <h2 className="text-sm font-semibold">Last 30 days</h2>
              <p className="mt-1 text-sm">Sales {ghs(98400)} · previous {ghs(91200)}</p>
              <p className="mt-1 text-xs text-slate-600">Estimated gross profit today {ghs(props.consolidated ? 4120 : 980)}. Product costs for today are recorded.</p>
            </div>
          ) : null}
        </div>
      </section>

      {props.consolidated ? (
        <section className="card mt-3 p-3">
          <h2 className="text-sm font-semibold">Sales today by branch</h2>
          <ul className="mt-2 space-y-2">
            {BRANCHES.map((branch) => (
              <li key={branch.name} className="grid grid-cols-[6rem_1fr_auto] items-center gap-2 text-sm">
                <span className="font-semibold">{branch.name}</span>
                <span className="h-2 rounded-full bg-accentSoft"><span className="block h-2 rounded-full bg-accent" style={{ width: `${(branch.sales / 7210) * 100}%` }} /></span>
                <span className="font-semibold tabular-nums">{ghs(branch.sales)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card mt-3 p-3">
        <h2 className="text-sm font-semibold">Top products today</h2>
        <ul className="mt-2 divide-y divide-slate-100 text-sm">
          {PRODUCTS.map((product, index) => (
            <li key={product.name} className="flex items-center justify-between gap-3 py-2">
              <span><span className="mr-2 text-xs font-semibold text-slate-400">{index + 1}</span>{product.name}</span>
              <span className="font-semibold tabular-nums">{ghs(product.amount)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function EmptyToday(props: { scopeText: string; updated: string; onRefresh: () => void }) {
  return (
    <div>
      <PageHead title="Today" scope={props.scopeText} updated={props.updated} onRefresh={props.onRefresh} />
      <section className="card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sales today</p>
        <p className="mt-1 font-display text-[1.85rem] font-semibold tabular-nums">{ghs(0)}</p>
        <p className="mt-1 text-sm">No sales recorded yet today.</p>
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Money received today</p>
          <p className="mt-1 font-display text-xl font-semibold tabular-nums">{ghs(0)}</p>
          <p className="mt-1 text-sm">No confirmed payments yet today.</p>
        </div>
        <p className="mt-3 text-sm text-slate-700">No till has been closed today, so there is no cash difference to show.</p>
      </section>
      <p className="mt-3 flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-card">
        Nothing needs attention right now.
      </p>
    </div>
  );
}

function ActivityScreen(props: {
  plan: Plan;
  storefront: boolean;
  consolidated: boolean;
  scopeText: string;
  updated: string;
  scene: Scene;
  onScreen: (screen: Screen) => void;
  onRefresh: () => void;
}) {
  if (props.scene === 'error') {
    return <StatusPanel tone="alert" title="Activity could not be loaded" body="The report list did not load. Try again." action="Try again" onAction={props.onRefresh} />;
  }
  const groups: { title: string; rows: { label: string; purpose: string; screen: Screen; show: boolean }[] }[] = [
    {
      title: 'Reports',
      rows: [
        { label: 'Trading', purpose: 'Sales for a period you choose', screen: 'trading', show: true },
        { label: 'Money received', purpose: 'Confirmed payments, separate from sales', screen: 'money', show: true },
        { label: 'Storefront', purpose: 'Online shop visits and orders', screen: 'activity', show: props.storefront && props.plan !== 'starter' },
      ],
    },
    {
      title: 'Queues',
      rows: [
        { label: 'MoMo to confirm', purpose: 'Payments waiting for you to confirm', screen: 'activity', show: true },
        { label: 'MoMo with the network', purpose: 'Collections still pending with the provider', screen: 'activity', show: true },
      ],
    },
    {
      title: 'Ledgers',
      rows: [
        { label: 'Cash drawer', purpose: 'Expected cash, counted cash, difference', screen: 'activity', show: true },
        { label: 'Stock movements', purpose: 'Stock in and out', screen: 'activity', show: true },
        { label: 'Product margins', purpose: 'Products below your target, when cost is known', screen: 'activity', show: props.plan !== 'starter' },
        { label: 'Stock to reorder', purpose: 'What may run out', screen: 'activity', show: props.plan !== 'starter' },
        { label: 'Sales by linked supplier', purpose: 'Sales for linked products. Not what you owe.', screen: 'activity', show: props.plan !== 'starter' },
        { label: 'Control alerts', purpose: 'Variances and discounts worth a look', screen: 'activity', show: props.plan !== 'starter' },
      ],
    },
  ];
  return (
    <div>
      <PageHead title="Activity" scope={props.consolidated ? 'Consolidated — all branches' : props.scopeText} updated={props.updated} onRefresh={props.onRefresh} />
      <div className="space-y-4">
        {groups.map((group) => (
          <section key={group.title}>
            <h2 className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{group.title}</h2>
            <ul className="mt-1.5 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
              {group.rows.filter((row) => row.show).map((row) => (
                <li key={row.label} className="border-b border-slate-100 last:border-0">
                  <button type="button" onClick={() => props.onScreen(row.screen)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accentSoft text-accent" aria-hidden="true"><Mark /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{row.label}</span>
                      <span className="block text-xs leading-5 text-slate-600">{row.purpose}</span>
                    </span>
                    <span className="text-slate-400" aria-hidden="true">›</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="card mt-3 flex flex-wrap items-center justify-between gap-2 p-3">
        <div>
          <p className="text-sm font-semibold">Last week (Monday–Sunday)</p>
          <p className="text-xs text-slate-600">21–27 September 2026</p>
        </div>
        <button type="button" className="btn-primary min-h-11 text-xs">Download last week</button>
      </div>
    </div>
  );
}

function MoreScreen(props: { plan: Plan; role: Role; onScreen: (screen: Screen) => void; updated: string; onRefresh: () => void; scopeText: string }) {
  const rows = [
    { label: 'Income statement', purpose: 'Sales, costs, expenses and profit for the whole business', screen: 'statement' as Screen, show: props.plan !== 'starter' },
    { label: 'Downloads', purpose: 'CSV files for sales, purchases, stock and the till', screen: 'downloads' as Screen, show: true },
    { label: 'Oversight', purpose: 'Owner brief, audit log and later scheduled packs', screen: 'oversight' as Screen, show: props.plan === 'pro' && props.role === 'owner' },
  ];
  return (
    <div>
      <PageHead title="More" scope={props.scopeText} updated={props.updated} onRefresh={props.onRefresh} />
      <ul className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
        {rows.filter((row) => row.show).map((row) => (
          <li key={row.label} className="border-b border-slate-100 last:border-0">
            <button type="button" onClick={() => props.onScreen(row.screen)} className="flex min-h-14 w-full items-center gap-3 px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{row.label}</span>
                <span className="block text-xs text-slate-600">{row.purpose}</span>
              </span>
              <span aria-hidden="true" className="text-slate-400">›</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MoneyScreen(props: {
  plan: Plan;
  consolidated: boolean;
  scopeText: string;
  desktop: boolean;
  scene: Scene;
  updated: string;
  onRefresh: () => void;
}) {
  const readOnly = props.scene === 'restricted';
  const received = props.consolidated ? 16920 : 4210;
  const rows = [
    ['2:05 pm', 'Cash', 'Kojo Mensah', ghs(props.consolidated ? 180 : 48)],
    ['1:40 pm', 'Mobile Money', 'Abena Owusu', ghs(props.consolidated ? 240 : 126)],
    ['12:15 pm', 'Mobile Money', 'Yaw Boateng', ghs(props.consolidated ? 90 : 64)],
    ['11:02 am', 'Bank transfer', 'Esi Larbi', ghs(200)],
  ];
  return (
    <div>
      <PageHead title="Money received" scope={props.consolidated ? 'Consolidated — all branches' : props.scopeText} updated={props.updated} onRefresh={props.onRefresh} />
      <p className="mb-2 text-sm text-slate-700">Confirmed customer money by the time it was received. Refunds stay separate.</p>
      <div className="flex flex-wrap gap-1.5">
        {['Today', 'Last 7 days', 'Last 30 days'].map((label, index) => (
          <span key={label} className={`inline-flex min-h-11 items-center rounded-full px-3 text-xs font-semibold ${index === 0 ? 'bg-accent text-white' : 'border border-slate-200 bg-white text-ink'}`}>{label}</span>
        ))}
      </div>
      <div className={`mt-3 grid gap-2 ${props.desktop ? 'grid-cols-3' : 'grid-cols-1'}`}>
        <Mini label="Money received" value={ghs(received)} />
        <Mini label="Refunds paid out" value={ghs(40)} />
        <Mini label="Waiting for confirmation" value={ghs(420)} />
      </div>
      {props.desktop ? (
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="py-2 font-medium">When</th><th className="font-medium">Method</th><th className="font-medium">Customer</th><th className="text-right font-medium">Amount</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]} className="border-t border-slate-100">
                <td className="py-2.5">{row[0]}</td><td>{row[1]}</td><td>{row[2]}</td><td className="text-right font-semibold tabular-nums">{row[3]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={row[0]} className="card px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold tabular-nums">{row[3]}</span>
                <span className="text-xs text-slate-500">{row[0]}</span>
              </div>
              <p className="text-sm text-slate-700">{row[1]} · {row[2]}</p>
            </li>
          ))}
        </ul>
      )}
      <button type="button" disabled={readOnly} className={`mt-3 min-h-11 ${readOnly ? 'btn-ghost' : 'btn-primary'}`}>
        {readOnly ? 'Downloads are off while billing is restricted' : 'Download CSV'}
      </button>
    </div>
  );
}

function TradingScreen(props: {
  consolidated: boolean;
  scopeText: string;
  desktop: boolean;
  updated: string;
  onRefresh: () => void;
  plan: Plan;
}) {
  return (
    <div>
      <PageHead title="Trading" scope={props.consolidated ? 'Consolidated — all branches' : props.scopeText} updated={props.updated} onRefresh={props.onRefresh} />
      <div className="flex flex-wrap gap-1.5">
        {['Today', 'Last 7 days', 'Last 30 days', 'Last week'].map((label, index) => (
          <span key={label} className={`inline-flex min-h-11 items-center rounded-full px-3 text-xs font-semibold ${index === 0 ? 'bg-accent text-white' : 'border border-slate-200 bg-white'}`}>{label}</span>
        ))}
      </div>
      <div className="card mt-3 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sales · today</p>
        <p className="font-display text-2xl font-semibold tabular-nums">{ghs(props.consolidated ? 18430 : 4860)}</p>
      </div>
      {props.desktop ? (
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="py-2 font-medium">Product</th><th className="text-right font-medium">Qty</th><th className="text-right font-medium">Sales</th></tr>
          </thead>
          <tbody>
            {PRODUCTS.map((product) => (
              <tr key={product.name} className="border-t border-slate-100">
                <td className="py-2.5">{product.name}</td>
                <td className="text-right tabular-nums">{product.qty}</td>
                <td className="text-right font-semibold tabular-nums">{ghs(product.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {PRODUCTS.map((product) => (
            <li key={product.name} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <span>{product.name}<span className="mt-0.5 block text-xs text-slate-500">{product.qty} sold</span></span>
              <span className="font-semibold tabular-nums">{ghs(product.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      {props.plan === 'starter' ? (
        <p className="mt-3 rounded-xl bg-accentSoft px-3 py-2 text-sm text-blue-900">Starter covers 30 days, including today. Earlier dates stay out of range.</p>
      ) : null}
    </div>
  );
}

function StatementScreen(props: {
  plan: Plan;
  scene: Scene;
  costsMissing: boolean;
  desktop: boolean;
  updated: string;
  onRefresh: () => void;
  onHelp: (help: string | null) => void;
  onScreen: (screen: Screen) => void;
}) {
  if (props.plan === 'starter') {
    return (
      <StatusPanel
        tone="neutral"
        title="The income statement is on Growth and Pro"
        body="Starter keeps today’s trading, money received, and downloads for this branch."
        action="Back to Today"
        onAction={() => props.onScreen('today')}
      />
    );
  }
  if (props.scene === 'loading') {
    return <div aria-busy="true" className="card p-4"><p className="text-sm font-semibold">Loading the income statement</p><div className="mt-3 h-40 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" /></div>;
  }
  if (props.scene === 'error') {
    return <StatusPanel tone="alert" title="The income statement could not be loaded" body="No figures are shown in its place." action="Try again" onAction={props.onRefresh} />;
  }
  if (props.scene === 'empty') {
    return (
      <div>
        <PageHead title="Income statement" scope="" accounting updated={props.updated} onRefresh={props.onRefresh} />
        <StatusPanel tone="neutral" title="No sales in this period" body="1 September to 30 September 2026 has no revenue, costs, or expenses to show." />
      </div>
    );
  }
  const missing = props.costsMissing;
  const readOnly = props.scene === 'restricted';
  const lines = [
    { label: 'Sales', amount: ghs(186400), prior: ghs(171200), strong: false, open: true },
    { label: 'Cost of goods', amount: missing ? '—' : ghs(142200), prior: missing ? '—' : ghs(131400), strong: false },
    { label: 'Gross profit', amount: missing ? 'Not shown' : ghs(44200), prior: missing ? '—' : ghs(39800), strong: true, note: missing ? '' : '23.7%' },
    { label: 'Operating expenses', amount: ghs(12800), prior: ghs(11950), strong: false },
    { label: 'Profit', amount: missing ? 'Not shown' : ghs(31400), prior: missing ? '—' : ghs(27850), strong: true, note: missing ? '' : '16.8%' },
  ];
  return (
    <div>
      <PageHead title="Income statement" scope="" accounting updated={props.updated} onRefresh={props.onRefresh} onHelp={() => props.onHelp('Income statement')} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {['This month', 'Last month'].map((label, index) => (
          <span key={label} className={`inline-flex min-h-11 items-center rounded-full px-3 text-xs font-semibold ${index === 0 ? 'bg-accent text-white' : 'border border-slate-200 bg-white'}`}>{label}</span>
        ))}
        <span className="text-xs text-slate-600">1–30 September 2026</span>
      </div>
      {missing ? (
        <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Product costs for this period are incomplete, so gross profit and profit are not shown.
        </p>
      ) : null}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Line</th>
              <th className="px-3 py-2 text-right font-semibold">September</th>
              {props.desktop ? <th className="px-3 py-2 text-right font-semibold">August</th> : null}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.label} className={`border-t border-slate-100 ${line.strong ? 'bg-slate-50 font-semibold' : ''}`}>
                <td className="px-3 py-2.5">
                  {line.label}
                  {line.note ? <span className="ml-2 text-xs font-semibold text-emerald-800">{line.note}</span> : null}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{line.amount}</td>
                {props.desktop ? <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{line.prior}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
        <details className="border-t border-slate-100">
          <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-semibold">Sales detail</summary>
          <p className="px-3 pb-3 text-sm text-slate-600">Sales after discounts and before VAT. Returns are excluded.</p>
        </details>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={readOnly} className={readOnly ? 'btn-ghost min-h-11' : 'btn-secondary min-h-11'}>Download CSV</button>
        <button type="button" disabled={readOnly} className={readOnly ? 'btn-ghost min-h-11' : 'btn-secondary min-h-11'}>Download PDF</button>
      </div>
    </div>
  );
}

function DownloadsScreen(props: { scene: Scene; plan: Plan; updated: string; onRefresh: () => void; scopeText: string }) {
  const readOnly = props.scene === 'restricted';
  const files = ['Sales', 'Purchases', 'Stock', 'Till records'];
  return (
    <div>
      <PageHead title="Downloads" scope={props.scopeText} updated={props.updated} onRefresh={props.onRefresh} />
      <ul className="space-y-2">
        {files.map((file) => (
          <li key={file} className="card flex min-h-14 items-center justify-between gap-3 px-3">
            <span className="text-sm font-semibold">{file}</span>
            <button type="button" disabled={readOnly} className={readOnly ? 'btn-ghost min-h-11 text-xs' : 'btn-secondary min-h-11 text-xs'}>
              {readOnly ? 'Off' : 'CSV'}
            </button>
          </li>
        ))}
      </ul>
      {props.plan === 'starter' ? <p className="mt-3 text-sm text-slate-600">Cost and margin columns are left out on Starter.</p> : null}
      <button type="button" disabled={readOnly} className={`mt-3 ${readOnly ? 'btn-ghost' : 'btn-primary'}`}>Download last week</button>
    </div>
  );
}

function OversightScreen(props: { plan: Plan; role: Role; updated: string; onRefresh: () => void }) {
  if (props.plan !== 'pro' || props.role !== 'owner') {
    return (
      <StatusPanel
        tone="neutral"
        title="Oversight stays with the owner"
        body="A manager can still open consolidated operating reports. Audit log, Owner brief and scheduled packs are not on this sign-in."
      />
    );
  }
  return (
    <div>
      <PageHead title="Oversight" scope="Consolidated — all branches" updated={props.updated} onRefresh={props.onRefresh} />
      <ul className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
        {['Owner brief', 'Audit log'].map((label) => (
          <li key={label} className="flex min-h-14 items-center border-b border-slate-100 px-3 text-sm font-semibold last:border-0">{label}</li>
        ))}
      </ul>
      <div className="card mt-3 p-3">
        <p className="text-sm font-semibold">Saved views</p>
        <p className="mt-1 text-sm text-slate-600">Not available yet. A saved view will keep a report, a branch scope, and a date preset.</p>
        <p className="mt-3 text-sm font-semibold">Monday pack</p>
        <p className="text-sm text-slate-600">Scheduled 7:00 am local time · one PDF · not available yet.</p>
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function BranchPicker({ shops, onScope }: { shops: Shops; onScope: (scope: Scope) => void }) {
  if (shops === 'single') {
    return <p className="card p-4 text-sm">Only Madina is set up. Today’s figures use that branch.</p>;
  }
  return (
    <div className="card p-4">
      <h1 className="font-display text-2xl font-semibold">Choose a branch</h1>
      <p className="mt-1 text-sm text-slate-600">Figures stay hidden until a branch is selected.</p>
      <div className="mt-3 space-y-2">
        {BRANCHES.map((branch) => (
          <button key={branch.name} type="button" className="flex min-h-12 w-full items-center rounded-xl bg-accentSoft px-4 text-left text-sm font-semibold text-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" onClick={() => onScope('branch')}>
            {branch.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function StatusPanel({
  tone,
  title,
  body,
  action,
  onAction,
}: {
  tone: 'neutral' | 'alert';
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
}) {
  const alert = tone === 'alert';
  return (
    <div role={alert ? 'alert' : 'status'} className={`rounded-2xl border px-4 py-4 shadow-card ${alert ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-white'}`}>
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-700">{body}</p>
      {action ? (
        <button type="button" onClick={onAction} className="btn-primary mt-3 min-h-11">{action}</button>
      ) : null}
    </div>
  );
}

function HelpDrawer({ title, onClose }: { title: string; onClose: () => void }) {
  const body = title === 'Cash difference today'
    ? 'Cash counted when a till closed today, minus the cash that till expected. The exact figure always shows. An attention row appears only at GHS 5 or more.'
    : title === 'Income statement'
      ? 'Revenue is sales after discounts and before VAT. Profit stays hidden when product costs are incomplete. The comparison is the previous calendar month.'
      : 'Sales recorded on the shop’s local date for the branch or consolidated view shown. This is the value of sales, not the cash in the drawer.';
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="help-title" className="mt-3 rounded-2xl border border-blue-100 bg-white p-4 shadow-raised">
      <h2 id="help-title" className="font-display text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6">{body}</p>
      <button type="button" className="btn-primary mt-3 min-h-11" onClick={onClose}>Close</button>
    </div>
  );
}
