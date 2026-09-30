'use client';

import { useState, type ReactNode } from 'react';

type Viewport = 'mobile' | 'desktop';
type Plan = 'starter' | 'growth' | 'pro';
type Role = 'owner' | 'manager' | 'cashier';
type Shops = 'single' | 'multi';
type Scope = 'branch' | 'all' | 'pick';
type Scene = 'healthy' | 'attention' | 'empty' | 'restricted' | 'cancelled' | 'loading' | 'error';
type Screen = 'today' | 'activity' | 'detail' | 'statements' | 'saved';

const PLANS: Plan[] = ['starter', 'growth', 'pro'];
const ROLES: Role[] = ['owner', 'manager', 'cashier'];
const SCENES: Scene[] = ['healthy', 'attention', 'empty', 'restricted', 'cancelled', 'loading', 'error'];
const SCREENS: { id: Screen; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'activity', label: 'Activity' },
  { id: 'detail', label: 'Money received' },
  { id: 'statements', label: 'Statements' },
  { id: 'saved', label: 'Saved packs' },
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
  const items: Attention[] = [
    {
      id: 'cash',
      tone: 'high',
      title: `Cash counted is ${ghs(consolidated ? 20 : 35)} less than expected`,
      detail: `${branch} · Main till · closed today at 1:40 pm`,
      action: 'Review shift',
    },
    {
      id: 'momo',
      tone: 'high',
      title: '3 Mobile Money payments are waiting for you to confirm',
      detail: `${ghs(420)} · not included in money received`,
      action: 'Confirm',
    },
    {
      id: 'customers',
      tone: 'medium',
      title: `${ghs(680)} from customers is past the due date`,
      detail: 'Unpaid credit that is not yet due is left off this list',
      action: 'Review',
    },
    {
      id: 'suppliers',
      tone: 'medium',
      title: `${ghs(1150)} to suppliers is past the due date`,
      detail: 'This is not every open purchase',
      action: 'Review',
    },
  ];
  if (plan === 'starter') {
    items.push({
      id: 'stock',
      tone: 'medium',
      title: 'Peak milk 400g may run out',
      detail: '4 left at Madina · 11 sold in the last 7 days',
      action: 'See stock',
    });
  } else {
    items.push({
      id: 'cost',
      tone: 'medium',
      title: 'Gino tomato mix sold for less than its cost',
      detail: `Today · ${branch} · the cost price is recorded`,
      action: 'See product',
    });
  }
  return items.slice(0, 5);
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

export default function BlueprintReview() {
  const [viewport, setViewport] = useState<Viewport>('mobile');
  const [plan, setPlan] = useState<Plan>('starter');
  const [role, setRole] = useState<Role>('owner');
  const [shops, setShops] = useState<Shops>('multi');
  const [scope, setScope] = useState<Scope>('branch');
  const [scene, setScene] = useState<Scene>('healthy');
  const [screen, setScreen] = useState<Screen>('today');
  const [storefront, setStorefront] = useState(false);
  const [help, setHelp] = useState<string | null>(null);
  const [rangeDenied, setRangeDenied] = useState(false);

  const consolidated = plan === 'pro' && scope === 'all' && shops === 'multi';
  const consolidationBlocked = scope === 'all' && plan !== 'pro' && shops === 'multi';
  const needsBranch = scope === 'pick' && shops === 'multi';
  const readOnly = scene === 'restricted';
  const scopeText = consolidated
    ? 'Consolidated — all branches'
    : shops === 'single'
      ? 'Madina'
      : 'Madina';

  const frame = (
    <ProductFrame
      viewport={viewport}
      plan={plan}
      role={role}
      shops={shops}
      screen={screen}
      scene={scene}
      storefront={storefront}
      consolidated={consolidated}
      consolidationBlocked={consolidationBlocked}
      needsBranch={needsBranch}
      readOnly={readOnly}
      scopeText={scopeText}
      help={help}
      rangeDenied={rangeDenied}
      onScreen={setScreen}
      onScope={setScope}
      onHelp={setHelp}
      onRangeDenied={setRangeDenied}
    />
  );

  return (
    <div className="min-h-screen bg-[#E8EEF8] text-[#111827]">
      <header className="border-b border-[#1E3A8A] bg-[#1E3A8A] px-4 py-3 text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-100">Design prototype · not live reports</p>
        <h1 className="mt-1 font-display text-xl font-semibold">TillFlow reports redesign</h1>
        <p className="mt-1 max-w-3xl text-sm text-blue-100">
          Sample shop only. Ama&apos;s Provisions, Ghana cedis, 30 September 2026. Nothing here reads the database.
        </p>
      </header>

      <div className="space-y-3 border-b border-[#D6DDEA] bg-white px-4 py-3">
        <ControlRow label="Screen size">
          <Choice current={viewport} value="mobile" onSelect={setViewport}>Mobile</Choice>
          <Choice current={viewport} value="desktop" onSelect={setViewport}>Desktop</Choice>
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
          <Choice current={scope} value="pick" onSelect={setScope}>Choose a branch</Choice>
        </ControlRow>
        <ControlRow label="State">
          {SCENES.map((item) => (
            <Choice key={item} current={scene} value={item} onSelect={setScene}>
              {item[0].toUpperCase() + item.slice(1)}
            </Choice>
          ))}
        </ControlRow>
        <ControlRow label="Page">
          {SCREENS.map((item) => (
            <Choice key={item.id} current={screen} value={item.id} onSelect={setScreen}>{item.label}</Choice>
          ))}
        </ControlRow>
        <ControlRow label="Storefront add-on">
          <Choice current={storefront ? 'on' : 'off'} value="off" onSelect={() => setStorefront(false)}>Off</Choice>
          <Choice current={storefront ? 'on' : 'off'} value="on" onSelect={() => setStorefront(true)}>On</Choice>
        </ControlRow>
        <p className="text-sm text-[#4B5563]">
          Cash flow forecast is left out of the navigation until the estimate is reliable. A cashier never sees these pages.
          {plan !== 'pro' ? ' All branches is refused below Pro, with no locked-card grid.' : ''}
        </p>
      </div>

      <div className="overflow-x-auto px-4 py-6">
        <div className={viewport === 'mobile' ? 'mx-auto w-[390px]' : 'mx-auto w-[1180px]'}>{frame}</div>
      </div>
    </div>
  );
}

function ControlRow<T extends string>({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-28 shrink-0 text-xs font-semibold uppercase tracking-wide text-[#4B5563]">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
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
      className={`min-h-11 rounded-full px-3 text-sm font-semibold ${
        selected ? 'bg-[#1E40AF] text-white' : 'bg-[#EFF6FF] text-[#1E3A8A]'
      }`}
    >
      {children}
    </button>
  );
}

function ProductFrame(props: {
  viewport: Viewport;
  plan: Plan;
  role: Role;
  shops: Shops;
  screen: Screen;
  scene: Scene;
  storefront: boolean;
  consolidated: boolean;
  consolidationBlocked: boolean;
  needsBranch: boolean;
  readOnly: boolean;
  scopeText: string;
  help: string | null;
  rangeDenied: boolean;
  onScreen: (screen: Screen) => void;
  onScope: (scope: Scope) => void;
  onHelp: (help: string | null) => void;
  onRangeDenied: (value: boolean) => void;
}) {
  const blockedRole = props.role === 'cashier';
  const cancelled = props.scene === 'cancelled';
  const showNav = !blockedRole && !cancelled;

  const body = blockedRole ? (
    <Denied
      title="Reports stay off the cashier till"
      body="Use the POS to sell. My Sales shows receipts you recorded yourself. This redesign does not open reports for cashiers."
    />
  ) : cancelled ? (
    <Denied
      title="This account is cancelled"
      body="Reports are closed. The owner can still open billing to disable a daily summary or see the masked destination. There is no report preview on a cancelled account."
      action="Open billing"
    />
  ) : (
    <ScreenBody {...props} />
  );

  if (props.viewport === 'desktop') {
    return (
      <div data-viewport="desktop" className="flex h-[820px] overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_20px_50px_rgba(15,23,42,0.12)]">
        <aside className="flex w-[248px] shrink-0 flex-col border-r border-[#E5E7EB] bg-[#F8FBFF] p-4">
          <p className="font-display text-lg font-semibold text-[#1E3A8A]">TillFlow</p>
          <p className="mt-1 text-sm text-[#4B5563]">Ama&apos;s Provisions · Sample</p>
          {showNav ? <DesktopNav {...props} /> : <p className="mt-6 text-sm text-[#4B5563]">No report navigation.</p>}
        </aside>
        <div className="relative min-w-0 flex-1 overflow-y-auto">{body}</div>
      </div>
    );
  }

  return (
    <div data-viewport="mobile" className="flex h-[844px] flex-col overflow-hidden rounded-[2rem] border-[10px] border-[#111827] bg-[#F8FBFF] shadow-[0_20px_50px_rgba(15,23,42,0.18)]">
      <div className="relative min-h-0 flex-1 overflow-y-auto">{body}</div>
      {showNav ? <MobileNav screen={props.screen} plan={props.plan} onScreen={props.onScreen} /> : null}
    </div>
  );
}

function DesktopNav(props: {
  plan: Plan;
  role: Role;
  screen: Screen;
  storefront: boolean;
  onScreen: (screen: Screen) => void;
}) {
  const items = navItems(props.plan, props.role, props.storefront);
  return (
    <nav className="mt-6 space-y-1" aria-label="Reports">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => props.onScreen(item.screen)}
          className={`flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left text-sm font-semibold ${
            props.screen === item.screen ? 'bg-[#1E40AF] text-white' : 'text-[#111827] hover:bg-white'
          }`}
        >
          <span>{item.label}</span>
          {item.note ? <span className={props.screen === item.screen ? 'text-blue-100' : 'text-[#4B5563]'}>{item.note}</span> : null}
        </button>
      ))}
    </nav>
  );
}

function MobileNav({
  screen,
  plan,
  onScreen,
}: {
  screen: Screen;
  plan: Plan;
  onScreen: (screen: Screen) => void;
}) {
  const tabs: { id: Screen; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'activity', label: 'Activity' },
    { id: 'statements', label: plan === 'starter' ? 'More' : 'More' },
  ];
  return (
    <nav className="grid grid-cols-3 border-t border-[#E5E7EB] bg-white" aria-label="Reports">
      {tabs.map((tab) => {
        const selected =
          tab.id === 'today'
            ? screen === 'today'
            : tab.id === 'activity'
              ? screen === 'activity' || screen === 'detail'
              : screen === 'statements' || screen === 'saved';
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onScreen(tab.id === 'statements' ? 'statements' : tab.id)}
            className={`min-h-16 text-sm font-semibold ${selected ? 'text-[#1E40AF]' : 'text-[#4B5563]'}`}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

function navItems(plan: Plan, role: Role, storefront: boolean) {
  const items: { id: string; label: string; screen: Screen; note?: string }[] = [
    { id: 'today', label: 'Today', screen: 'today' },
    { id: 'activity', label: 'Activity', screen: 'activity' },
  ];
  if (plan !== 'starter') items.push({ id: 'statements', label: 'Statements', screen: 'statements' });
  else items.push({ id: 'more', label: 'Downloads', screen: 'statements' });
  if (plan === 'pro' && role === 'owner') {
    items.push({ id: 'saved', label: 'Saved views', screen: 'saved', note: 'Later' });
  }
  if (storefront && plan !== 'starter') items.push({ id: 'shop', label: 'Storefront', screen: 'activity', note: 'Add-on' });
  return items;
}

function ScreenBody(props: {
  plan: Plan;
  role: Role;
  shops: Shops;
  screen: Screen;
  scene: Scene;
  storefront: boolean;
  consolidated: boolean;
  consolidationBlocked: boolean;
  needsBranch: boolean;
  readOnly: boolean;
  scopeText: string;
  help: string | null;
  rangeDenied: boolean;
  viewport: Viewport;
  onScreen: (screen: Screen) => void;
  onScope: (scope: Scope) => void;
  onHelp: (help: string | null) => void;
  onRangeDenied: (value: boolean) => void;
}) {
  return (
    <div className="px-4 py-4 sm:px-8 sm:py-6">
      {props.readOnly ? (
        <p className="mb-4 rounded-xl bg-[#FFFBEB] px-3 py-3 text-sm font-medium leading-5 text-[#78350F]">
          Read-only. You can look at reports. Downloads and changes stay off until billing is sorted.
        </p>
      ) : null}
      {props.needsBranch && props.screen !== 'saved' && !(props.screen === 'statements' && props.plan !== 'starter') ? (
        <div data-screen="pick-branch">
          <Header title="Today" scope="No branch selected" />
          <BranchPicker shops={props.shops} onScope={props.onScope} />
        </div>
      ) : null}
      {props.needsBranch && props.screen !== 'saved' && !(props.screen === 'statements' && props.plan !== 'starter') ? null : props.screen === 'today' ? <TodayScreen {...props} /> : null}
      {props.needsBranch && props.screen !== 'saved' && !(props.screen === 'statements' && props.plan !== 'starter') ? null : props.screen === 'activity' ? <ActivityScreen {...props} /> : null}
      {props.needsBranch && props.screen !== 'saved' && !(props.screen === 'statements' && props.plan !== 'starter') ? null : props.screen === 'detail' ? <DetailScreen {...props} /> : null}
      {props.screen === 'statements' && props.needsBranch && props.plan === 'starter' ? null : props.screen === 'statements' ? <StatementsScreen {...props} /> : null}
      {props.screen === 'saved' ? <SavedScreen {...props} /> : null}
      {props.help ? (
        <div role="dialog" aria-modal="true" aria-labelledby="metric-help-title" className="mt-4 rounded-2xl border border-[#BFDBFE] bg-white p-4 shadow-lg">
          <h2 id="metric-help-title" className="font-display text-lg font-semibold">{props.help}</h2>
          <p className="mt-2 text-sm leading-6 text-[#111827]">{definition(props.help)}</p>
          <button type="button" className="mt-3 min-h-11 rounded-xl bg-[#1E40AF] px-4 text-sm font-semibold text-white" onClick={() => props.onHelp(null)}>
            Close
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TodayScreen(props: {
  plan: Plan;
  scene: Scene;
  shops: Shops;
  viewport: Viewport;
  consolidated: boolean;
  consolidationBlocked: boolean;
  needsBranch: boolean;
  scopeText: string;
  onScope: (scope: Scope) => void;
  onHelp: (help: string | null) => void;
  onScreen: (screen: Screen) => void;
}) {
  return (
    <div data-screen="today">
      <Header
        title="Today"
        scope={props.needsBranch ? 'No branch selected' : props.scopeText}
        onHelp={() => props.onHelp('Sales today')}
      />
      {props.needsBranch ? (
        <BranchPicker shops={props.shops} onScope={props.onScope} />
      ) : props.consolidationBlocked ? (
        <BlockedConsolidation onStay={() => props.onScope('branch')} />
      ) : props.scene === 'loading' ? (
        <LoadingState />
      ) : props.scene === 'error' ? (
        <ErrorState />
      ) : props.scene === 'empty' ? (
        <EmptyToday />
      ) : (
        <TodayFigures {...props} />
      )}
    </div>
  );
}

function Header({ title, scope, onHelp, accounting }: { title: string; scope: string; onHelp?: () => void; accounting?: boolean }) {
  return (
    <header className="mb-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[1.75rem] font-semibold leading-tight">{title}</h1>
          <p className="mt-1 text-sm text-[#4B5563]">Wednesday 30 September 2026 · Ghana time</p>
        </div>
        {onHelp ? (
          <button type="button" className="min-h-11 shrink-0 rounded-xl px-3 text-sm font-semibold text-[#1E40AF]" onClick={onHelp}>
            What is this?
          </button>
        ) : null}
      </div>
      <p className="mt-3 inline-flex max-w-full min-h-11 items-center rounded-full bg-[#EFF6FF] px-3 py-2 text-left text-sm font-semibold leading-5 text-[#1E3A8A]">
        {accounting ? 'Whole business — not separated by branch' : scope}
      </p>
      <p className="mt-2 text-sm text-[#4B5563]">Updated 2:14 pm</p>
    </header>
  );
}

function TodayFigures(props: {
  plan: Plan;
  scene: Scene;
  viewport: Viewport;
  consolidated: boolean;
  onScreen: (screen: Screen) => void;
  onHelp: (help: string | null) => void;
}) {
  const sales = props.consolidated ? 18430 : 4860;
  const received = props.consolidated ? 16920 : 4210;
  const attention = props.scene === 'attention';
  const difference = attention ? (props.consolidated ? -20 : -35) : 0;
  const wide = props.viewport === 'desktop';
  return (
    <div>
      <div className={wide ? 'grid grid-cols-[minmax(0,28rem)_minmax(0,1fr)] items-start gap-8' : ''}>
      <section className="rounded-2xl bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        <Figure label="Sales today" value={ghs(sales)} hint={props.consolidated ? '86 sales · yesterday GHS 17,040' : '42 sales · yesterday GHS 4,120'} onHelp={() => props.onHelp('Sales today')} />
        <Figure label="Money received today" value={ghs(received)} hint="Confirmed payments · Cash, MoMo and transfer" onHelp={() => props.onHelp('Money received today')} />
        <Figure
          label="Cash difference today"
          value={ghs(difference)}
          hint={difference === 0 ? 'Closed tills match expected cash' : 'Counted minus expected · closed tills only'}
          onHelp={() => props.onHelp('Cash difference today')}
        />
        <button type="button" className="mt-2 min-h-11 text-sm font-semibold text-[#1E40AF]" onClick={() => props.onScreen('detail')}>
          Open money received
        </button>
      </section>

      <section className={wide ? '' : 'mt-5'}>
        <h2 className="font-display text-lg font-semibold">Needs attention</h2>
        {attention ? (
          <ul className="mt-2 space-y-2">
            {attentionItems(props.plan, props.consolidated).map((item) => (
              <li key={item.id}>
                <button type="button" className="flex min-h-16 w-full items-center gap-3 rounded-2xl bg-white px-3 py-3 text-left shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                  <span className={`h-12 w-1.5 shrink-0 rounded-full ${item.tone === 'high' ? 'bg-[#B91C1C]' : 'bg-[#B45309]'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold leading-5">{item.title}</span>
                    <span className="mt-1 block text-sm leading-5 text-[#4B5563]">{item.detail}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-[#1E40AF]">{item.action}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 rounded-2xl bg-white px-4 py-4 text-sm leading-6 text-[#111827] shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
            Nothing needs attention right now.
          </p>
        )}
      </section>
      </div>

      <section className="mt-6">
        <h2 className="font-display text-lg font-semibold">Last 7 days</h2>
        <p className="mt-1 text-sm leading-6 text-[#4B5563]">Thursday 24 September through today, Ghana time.</p>
        <ul className="mt-3 space-y-3 rounded-2xl bg-white p-4">
          {(props.consolidated ? WEEK.map((bar) => ({ ...bar, amount: Math.round(bar.amount * 3.6) })) : WEEK).map((bar, _index, list) => {
            const max = Math.max(...list.map((item) => item.amount));
            return (
              <li key={bar.day}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-semibold">{bar.day}</span>
                  <span className="tabular-nums">{ghs(bar.amount)}</span>
                </div>
                <div className="mt-1 h-2.5 rounded-full bg-[#DBEAFE]">
                  <div className="h-2.5 rounded-full bg-[#1E40AF]" style={{ width: `${Math.max(8, (bar.amount / max) * 100)}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {props.plan !== 'starter' ? (
        <section className="mt-6 rounded-2xl bg-white p-4">
          <h2 className="font-display text-lg font-semibold">Last 30 days</h2>
          <p className="mt-1 text-sm leading-6 text-[#111827]">Sales {ghs(98400)}. The previous 30 days were {ghs(91200)}.</p>
          <p className="mt-2 text-sm leading-6 text-[#4B5563]">
            Estimated gross profit today {ghs(props.consolidated ? 4120 : 980)}. Shown because product costs for today&apos;s sales are recorded.
          </p>
        </section>
      ) : null}

      {props.consolidated ? (
        <section className="mt-6">
          <h2 className="font-display text-lg font-semibold">Sales today by branch</h2>
          <ul className="mt-2 space-y-2">
            {BRANCHES.map((branch) => (
              <li key={branch.name} className="flex min-h-12 items-center justify-between rounded-xl bg-white px-3 text-sm">
                <span className="font-semibold">{branch.name}</span>
                <span className="font-semibold tabular-nums">{ghs(branch.sales)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6 rounded-2xl bg-white p-4">
        <h2 className="font-display text-lg font-semibold">How money came in today</h2>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full" aria-hidden="true">
          <div className="bg-[#1E40AF]" style={{ width: '51%' }} />
          <div className="bg-[#0F766E]" style={{ width: '44%' }} />
          <div className="bg-[#B45309]" style={{ width: '5%' }} />
        </div>
        <ul className="mt-3 space-y-1 text-sm text-[#111827]">
          <li>Cash {ghs(props.consolidated ? 8640 : 2140)}</li>
          <li>Mobile Money {ghs(props.consolidated ? 7420 : 1870)}</li>
          <li>Bank transfer {ghs(props.consolidated ? 860 : 200)}</li>
        </ul>
        <h3 className="mt-4 font-semibold">Top products today</h3>
        <ul className="mt-2 space-y-2 text-sm">
          <li className="flex justify-between gap-3"><span>Indomie chicken 70g</span><span className="font-semibold">{ghs(640)}</span></li>
          <li className="flex justify-between gap-3"><span>Peak milk 400g</span><span className="font-semibold">{ghs(520)}</span></li>
          <li className="flex justify-between gap-3"><span>Voltic water 750ml</span><span className="font-semibold">{ghs(410)}</span></li>
        </ul>
      </section>
    </div>
  );
}

function Figure({ label, value, hint, onHelp }: { label: string; value: string; hint: string; onHelp: () => void }) {
  return (
    <button type="button" onClick={onHelp} className="block w-full border-b border-[#E5E7EB] py-3 text-left last:border-0">
      <span className="block text-sm font-medium text-[#4B5563]">{label}</span>
      <span className="mt-1 block font-display text-[1.7rem] font-semibold leading-tight tabular-nums">{value}</span>
      <span className="mt-1 block text-sm text-[#4B5563]">{hint}</span>
    </button>
  );
}

function BranchPicker({ shops, onScope }: { shops: Shops; onScope: (scope: Scope) => void }) {
  if (shops === 'single') {
    return <p className="rounded-2xl bg-white p-4 text-sm leading-6">Only Madina is set up. Today&apos;s figures use that branch.</p>;
  }
  return (
    <div className="rounded-2xl bg-white p-4">
      <h2 className="font-display text-xl font-semibold">Choose a branch</h2>
      <p className="mt-2 text-sm leading-6 text-[#4B5563]">Today&apos;s figures stay hidden until a branch is selected. Nothing is added together.</p>
      <div className="mt-4 space-y-2">
        {BRANCHES.map((branch) => (
          <button key={branch.name} type="button" className="flex min-h-14 w-full items-center rounded-xl bg-[#EFF6FF] px-4 text-left text-base font-semibold text-[#1E3A8A]" onClick={() => onScope('branch')}>
            {branch.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function BlockedConsolidation({ onStay }: { onStay: () => void }) {
  return (
    <div className="rounded-2xl bg-white p-4">
      <h2 className="font-display text-xl font-semibold">All branches is part of Pro</h2>
      <p className="mt-2 text-sm leading-6 text-[#111827]">Growth and Starter report on one branch. No combined total is shown, and this page is not filled with locked cards.</p>
      <button type="button" className="mt-4 min-h-11 rounded-xl bg-[#1E40AF] px-4 text-sm font-semibold text-white" onClick={onStay}>
        View Madina
      </button>
    </div>
  );
}

function LoadingState() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-3 rounded-2xl bg-white p-4">
      <p className="text-sm font-semibold">Loading today&apos;s figures</p>
      <div className="h-8 w-40 animate-pulse rounded-lg bg-[#E5E7EB]" />
      <div className="h-8 w-52 animate-pulse rounded-lg bg-[#E5E7EB]" />
      <div className="h-8 w-36 animate-pulse rounded-lg bg-[#E5E7EB]" />
    </div>
  );
}

function ErrorState() {
  return (
    <div role="alert" className="rounded-2xl bg-white p-4">
      <h2 className="font-display text-xl font-semibold">Today could not be loaded</h2>
      <p className="mt-2 text-sm leading-6 text-[#111827]">Check the connection and try again. No figures are shown in their place.</p>
      <button type="button" className="mt-4 min-h-11 rounded-xl bg-[#1E40AF] px-4 text-sm font-semibold text-white">Try again</button>
    </div>
  );
}

function EmptyToday() {
  return (
    <div className="rounded-2xl bg-white p-4">
      <p className="text-sm text-[#4B5563]">Sales today</p>
      <p className="font-display text-[1.7rem] font-semibold">{ghs(0)}</p>
      <p className="mt-1 text-sm">No sales recorded yet today.</p>
      <p className="mt-4 text-sm text-[#4B5563]">Money received today</p>
      <p className="font-display text-[1.7rem] font-semibold">{ghs(0)}</p>
      <p className="mt-1 text-sm">No confirmed payments yet today.</p>
      <p className="mt-4 text-sm leading-6">No till has been closed today, so there is no cash difference to show.</p>
      <p className="mt-4 text-sm leading-6 text-[#4B5563]">When a sale is recorded, it will appear here. Nothing else is flagged.</p>
    </div>
  );
}

function ActivityScreen(props: { plan: Plan; storefront: boolean; scopeText: string; consolidated: boolean; onScreen: (screen: Screen) => void }) {
  const rows = [
    ['Trading', 'Sales for a period you choose', true],
    ['Money received', 'Confirmed payments, separate from sales', true],
    ['MoMo to confirm', 'Payments waiting for you to confirm', true],
    ['Cash drawer', 'Expected cash, counted cash, difference', true],
    ['Stock movements', 'Stock in and out', true],
    ['Product margins', 'Products below your target, when cost is known', props.plan !== 'starter'],
    ['Stock to reorder', 'What may run out', props.plan !== 'starter'],
    ['Sales by linked supplier', 'Sales for products linked to a supplier. Not what you owe them.', props.plan !== 'starter'],
    ['Control alerts', 'Variances and discounts worth a look', props.plan !== 'starter'],
    ['Storefront', 'Visits and orders on the online shop', props.storefront && props.plan !== 'starter'],
  ] as const;
  return (
    <div data-screen="activity">
      <Header title="Activity" scope={props.consolidated ? 'Consolidated — all branches' : props.scopeText} />
      <ul className="space-y-2">
        {rows.filter((row) => row[2]).map((row) => (
          <li key={row[0]}>
            <button type="button" onClick={() => props.onScreen(row[0] === 'Money received' ? 'detail' : 'activity')} className="flex min-h-16 w-full flex-col justify-center rounded-2xl bg-white px-4 py-3 text-left">
              <span className="text-base font-semibold">{row[0]}</span>
              <span className="mt-1 text-sm leading-5 text-[#4B5563]">{row[1]}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DetailScreen(props: {
  plan: Plan;
  readOnly: boolean;
  scopeText: string;
  consolidated: boolean;
  rangeDenied: boolean;
  viewport: Viewport;
  onRangeDenied: (value: boolean) => void;
}) {
  const received = props.consolidated ? 16920 : 4210;
  const rows = [
    ['2:05 pm', 'Cash', 'Kojo Mensah', ghs(props.consolidated ? 180 : 48)],
    ['1:40 pm', 'Mobile Money', 'Abena Owusu', ghs(props.consolidated ? 240 : 126)],
    ['12:15 pm', 'Mobile Money', 'Yaw Boateng', ghs(props.consolidated ? 90 : 64)],
    ['11:02 am', 'Bank transfer', 'Esi Larbi', ghs(props.consolidated ? 200 : 200)],
  ];
  return (
    <div data-screen="detail">
      <Header title="Money received" scope={props.consolidated ? 'Consolidated — all branches' : props.scopeText} />
      <p className="mb-3 text-sm leading-6 text-[#111827]">Confirmed customer money by the time it was received. This is not the sales total, and refunds are kept separate.</p>
      <div className="flex flex-wrap gap-2">
        {['Today', 'Last 7 days', 'Last 30 days'].map((label, index) => (
          <span key={label} className={`inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold ${index === 0 ? 'bg-[#1E40AF] text-white' : 'bg-white text-[#1E3A8A]'}`}>{label}</span>
        ))}
      </div>
      {props.plan === 'starter' ? (
        <button type="button" className="mt-3 min-h-11 text-sm font-semibold text-[#1E40AF]" onClick={() => props.onRangeDenied(true)}>
          Ask for 1 January 2025
        </button>
      ) : null}
      {props.rangeDenied && props.plan === 'starter' ? (
        <p className="mt-3 rounded-xl bg-[#EFF6FF] px-3 py-3 text-sm leading-6 text-[#1E3A8A]">
          Starter covers 30 days, including today. The earliest date is 1 September 2026. The range was not silently widened.
        </p>
      ) : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Mini label="Money received" value={ghs(received)} />
        <Mini label="Refunds paid out" value={ghs(40)} />
        <Mini label="Waiting for MoMo confirmation" value={ghs(420)} />
      </div>
      {props.viewport === 'desktop' ? (
        <table className="mt-4 w-full text-left text-sm">
          <thead className="text-[#4B5563]">
            <tr><th className="py-2 font-medium">When received</th><th className="py-2 font-medium">Method</th><th className="py-2 font-medium">Customer</th><th className="py-2 text-right font-medium">Amount</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]} className="border-t border-[#E5E7EB]">
                <td className="py-3">{row[0]}</td><td>{row[1]}</td><td>{row[2]}</td><td className="text-right font-semibold tabular-nums">{row[3]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((row) => (
            <li key={row[0]} className="rounded-2xl bg-white px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">{row[3]}</span>
                <span className="text-sm text-[#4B5563]">{row[0]}</span>
              </div>
              <p className="mt-1 text-sm text-[#111827]">{row[1]} · {row[2]}</p>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        disabled={props.readOnly}
        className={`mt-4 min-h-11 rounded-xl px-4 text-sm font-semibold ${props.readOnly ? 'bg-[#E5E7EB] text-[#4B5563]' : 'bg-[#1E40AF] text-white'}`}
      >
        {props.readOnly ? 'Downloads are off while billing is restricted' : 'Download CSV'}
      </button>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-3">
      <p className="text-sm text-[#4B5563]">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function StatementsScreen(props: { plan: Plan; role: Role; readOnly: boolean; onScreen: (screen: Screen) => void }) {
  if (props.plan === 'starter') {
    return (
      <div data-screen="statements">
        <Header title="Downloads" scope="Madina" />
        <p className="text-sm leading-6">Download sales, purchases, stock and till records for Madina. Cost and margin columns are left out on Starter.</p>
        <button type="button" disabled={props.readOnly} className={`mt-4 min-h-11 rounded-xl px-4 text-sm font-semibold ${props.readOnly ? 'bg-[#E5E7EB] text-[#4B5563]' : 'bg-[#1E40AF] text-white'}`}>
          {props.readOnly ? 'Downloads are off' : 'Download sales CSV'}
        </button>
        <p className="mt-4 text-sm leading-6 text-[#4B5563]">Income statement, balance sheet and cash flow statement are on Growth and Pro. They cover the whole business, not one branch.</p>
      </div>
    );
  }
  return (
    <div data-screen="statements">
      <Header title="Income statement" scope="" accounting />
      <p className="text-sm leading-6">1 September 2026 to 30 September 2026. Revenue is sales after discounts and before VAT. Profit is hidden if product costs are missing.</p>
      <dl className="mt-4 space-y-3 rounded-2xl bg-white p-4 text-sm">
        <Row k="Sales" v={ghs(186400)} />
        <Row k="Cost of goods" v={ghs(142200)} />
        <Row k="Gross profit" v={ghs(44200)} />
        <Row k="Expenses" v={ghs(12800)} />
        <Row k="Profit" v={ghs(31400)} />
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        {['Balance sheet', 'Cash flow statement', 'Downloads'].map((label) => (
          <span key={label} className="inline-flex min-h-11 items-center rounded-full bg-white px-3 text-sm font-semibold text-[#1E3A8A]">{label}</span>
        ))}
      </div>
      {props.plan === 'pro' && props.role === 'owner' ? (
        <button type="button" className="mt-4 min-h-11 text-sm font-semibold text-[#1E40AF]" onClick={() => props.onScreen('saved')}>
          Saved views and scheduled packs
        </button>
      ) : null}
      {props.plan === 'pro' && props.role === 'manager' ? (
        <p className="mt-4 text-sm leading-6 text-[#4B5563]">Audit log and Owner brief stay with the owner. You can still open these statements.</p>
      ) : null}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#E5E7EB] py-2 last:border-0">
      <dt>{k}</dt>
      <dd className="font-semibold tabular-nums">{v}</dd>
    </div>
  );
}

function SavedScreen(props: { plan: Plan; role: Role }) {
  if (props.plan !== 'pro' || props.role !== 'owner') {
    return (
      <div data-screen="saved">
        <Header title="Saved views" scope="Not on this plan" />
        <p className="text-sm leading-6">Saved views and scheduled packs are a later Pro release for the owner. They start from reports you already use. There is no custom report builder.</p>
      </div>
    );
  }
  return (
    <div data-screen="saved">
      <p className="mb-3 rounded-xl bg-[#EFF6FF] px-3 py-3 text-sm font-medium leading-6 text-[#1E3A8A]">Concept for a later Pro release. Not in the product today.</p>
      <Header title="Saved views" scope="Consolidated — all branches" />
      <ul className="space-y-2">
        <li className="rounded-2xl bg-white px-4 py-3">
          <p className="font-semibold">Madina · money received · last 7 days</p>
          <p className="mt-1 text-sm text-[#4B5563]">Saved by Ama · used yesterday</p>
        </li>
        <li className="rounded-2xl bg-white px-4 py-3">
          <p className="font-semibold">All branches · sales today</p>
          <p className="mt-1 text-sm text-[#4B5563]">Scheduled Monday 7:00 am · Ghana time · one PDF</p>
        </li>
      </ul>
    </div>
  );
}

function Denied({ title, body, action }: { title: string; body: string; action?: string }) {
  return (
    <div className="px-4 py-8">
      <h1 className="font-display text-[1.75rem] font-semibold leading-tight">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-[#111827]">{body}</p>
      {action ? <button type="button" className="mt-4 min-h-11 rounded-xl bg-[#1E40AF] px-4 text-sm font-semibold text-white">{action}</button> : null}
    </div>
  );
}

function definition(title: string) {
  if (title === 'Money received today') {
    return 'Confirmed payments received today in Ghana time, for the branch shown. Credit sales are not included until the customer pays. Refunds are not subtracted here.';
  }
  if (title === 'Cash difference today') {
    return 'Cash counted when a till was closed today, minus the cash the till expected. A negative figure means the count was lower. It is not an accusation. Open tills are excluded because they have not been counted.';
  }
  return 'Sales recorded today in Ghana time, for the branch or consolidated view shown. Returned and voided sales are excluded. This is the value of sales, not the cash in the drawer.';
}
