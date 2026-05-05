import CatalogueVisibilityFilter from '@/components/CatalogueVisibilityFilter';
import Link from 'next/link';
import FormError from '@/components/FormError';
import PageHeader from '@/components/PageHeader';
import AdvancedModeNotice from '@/components/AdvancedModeNotice';
import { updateStorefrontSettingsAction, updateStorefrontHoursAction, bulkSetStorefrontPublishAction, updateStorefrontCategoryMappingsAction, hideOutOfStockStorefrontProductsAction } from '@/app/actions/online-storefront';
import { requireBusiness } from '@/lib/auth';
import { getFeatures } from '@/lib/features';
import { prisma } from '@/lib/prisma';
import { DAY_KEYS, DAY_LABELS, makeDefaultWeeklyHours, parseWeeklyHours } from '@/lib/business-hours';
import { headers } from 'next/headers';
import StorefrontPaymentModeCard from '@/components/StorefrontPaymentModeCard';
import StorefrontAccessCard from '@/components/StorefrontAccessCard';
import StorefrontBrandingCard from '@/components/StorefrontBrandingCard';
import SettingsSection from '@/components/SettingsSection';
import { normalizePaymentMode } from '@/lib/storefront-payments';
import { buildStorefrontUrl } from '@/lib/storefront-url';
import { hasPlanAccess, getBusinessPlan } from '@/lib/features';
import { resolvePrimaryBrandColor } from '@/lib/storefront-branding';
import { normalizePublicCategoryName, suggestedPublicCategoryOptions } from '@/lib/storefront-taxonomy';

export default async function OnlineStoreSettingsPage({
  searchParams,
}: {
  searchParams?: { error?: string; saved?: string };
}) {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  const addonOnlineStorefront = (business as any).addonOnlineStorefront ?? false;
  const features = getFeatures(
    (business as any).plan ?? (business.mode as any),
    (business as any).storeMode as any,
    { onlineStorefront: addonOnlineStorefront },
  );

  if (!features.onlineStorefront) {
    return (
      <AdvancedModeNotice
        title="Online storefront requires Pro or Growth add-on"
        description="Publish a customer-facing shop on Pro (included) or on Growth for +GH₵200/mo. Contact your TillFlow account manager to enable the add-on."
        featureName="Online Storefront"
        minimumPlan="PRO"
      />
    );
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [
    storefrontBusiness,
    categoryMappings,
    eventCounts,
    totalProducts,
    totalPublished,
    publishedInventoryTotals,
    categories,
    activeProductCounts,
    publishedProductCounts,
  ] = await Promise.all([
    prisma.business.findUnique({
      where: { id: business.id },
      select: {
        id: true,
        name: true,
        storefrontEnabled: true,
        storefrontSlug: true,
        storefrontHeadline: true,
        storefrontDescription: true,
        storefrontPickupInstructions: true,
        storefrontHoursJson: true,
        storefrontPickupPrepMinutes: true,
        storefrontMomoNumber: true,
        storefrontMomoNetwork: true,
        storefrontPaymentMode: true,
        storefrontMerchantShortcode: true,
        storefrontBankName: true,
        storefrontBankAccountName: true,
        storefrontBankAccountNumber: true,
        storefrontBankBranch: true,
        storefrontPaymentNote: true,
        storefrontLogoUrl: true,
        storefrontPrimaryColor: true,
        storefrontAccentColor: true,
        storefrontTagline: true,
        smsNotificationsEnabled: true,
        smsSenderId: true,
      },
    }),
    prisma.storefrontCategoryMapping.findMany({
      where: { businessId: business.id },
      orderBy: [{ priority: 'asc' }, { publicCategoryName: 'asc' }],
      select: {
        rawCategoryName: true,
        publicCategoryName: true,
        priority: true,
        hidden: true,
      },
    }),
    prisma.storefrontEvent.groupBy({
      by: ['eventType'],
      where: { businessId: business.id, timestamp: { gte: since } },
      _count: { _all: true },
    }),
    prisma.product.count({
      where: { businessId: business.id, active: true },
    }),
    prisma.product.count({
      where: { businessId: business.id, active: true, storefrontPublished: true },
    }),
    prisma.inventoryBalance.groupBy({
      by: ['productId'],
      where: {
        product: {
          businessId: business.id,
          active: true,
          storefrontPublished: true,
        },
      },
      _sum: { qtyOnHandBase: true },
    }),
    prisma.category.findMany({
      where: { businessId: business.id },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.product.groupBy({
      by: ['categoryId'],
      where: { businessId: business.id, active: true },
      _count: { _all: true },
    }),
    prisma.product.groupBy({
      by: ['categoryId'],
      where: { businessId: business.id, active: true, storefrontPublished: true },
      _count: { _all: true },
    }),
  ]);

  const mappingByRaw = new Map(categoryMappings.map((mapping) => [mapping.rawCategoryName.toLowerCase(), mapping]));
  const analytics = new Map(eventCounts.map((event) => [event.eventType, event._count._all]));
  const visits = analytics.get('view') ?? 0;
  const addToCart = analytics.get('add_to_cart') ?? 0;
  const checkoutStarts = analytics.get('checkout_start') ?? 0;
  const ordersPlaced = analytics.get('order_placed') ?? 0;
  const conversionRate = visits > 0 ? Math.round((ordersPlaced / visits) * 1000) / 10 : 0;
  const activeCountByCategoryId = new Map(
    activeProductCounts.map((entry) => [entry.categoryId ?? '__uncategorised__', entry._count._all]),
  );
  const publishedCountByCategoryId = new Map(
    publishedProductCounts.map((entry) => [entry.categoryId ?? '__uncategorised__', entry._count._all]),
  );
  const categorySummaries = categories
    .map((category) => ({
      id: category.id,
      name: category.name,
      total: activeCountByCategoryId.get(category.id) ?? 0,
      published: publishedCountByCategoryId.get(category.id) ?? 0,
    }))
    .filter((category) => category.total > 0);
  const uncategorisedTotal = activeCountByCategoryId.get('__uncategorised__') ?? 0;
  const uncategorisedPublished = publishedCountByCategoryId.get('__uncategorised__') ?? 0;
  const categoryPublishSummaries =
    uncategorisedTotal > 0
      ? [
          ...categorySummaries,
          {
            id: '__uncategorised__',
            name: 'Uncategorised',
            total: uncategorisedTotal,
            published: uncategorisedPublished,
          },
        ]
      : categorySummaries;
  const publishedOutOfStock =
    totalPublished -
    publishedInventoryTotals.filter((entry) => (entry._sum.qtyOnHandBase ?? 0) > 0).length;

  const plan = getBusinessPlan(
    ((business as any).plan ?? (business.mode as any)) as any,
    (business as any).storeMode as any,
  );
  const basicBrandingEnabled = hasPlanAccess(plan, 'GROWTH');
  const extendedBrandingEnabled = hasPlanAccess(plan, 'PRO');

  if (!storefrontBusiness) {
    return <div className="card p-6">Business not found.</div>;
  }

  const publicUrl = storefrontBusiness.storefrontSlug
    ? `/shop/${storefrontBusiness.storefrontSlug}`
    : null;
  const requestHeaders = headers();
  const requestHost = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const requestProtocol = requestHeaders.get('x-forwarded-proto') ?? 'https';
  const requestOrigin = requestHost ? `${requestProtocol}://${requestHost}` : null;
  const absoluteStorefrontUrl = buildStorefrontUrl(storefrontBusiness.storefrontSlug, requestOrigin);
  const storefrontPrimaryColor = resolvePrimaryBrandColor(storefrontBusiness.storefrontPrimaryColor);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Online Storefront"
        subtitle="Publish a public catalogue, accept mobile-money checkout, and manage pickup orders from TillFlow."
      />

      <div className="grid gap-2.5 sm:grid-cols-3">
        <div className="rounded-2xl border border-black/5 bg-white px-4 py-3 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/35">Status</div>
          <div className="mt-1 text-sm font-semibold text-ink">{storefrontBusiness.storefrontEnabled ? 'Online store active' : 'Not published yet'}</div>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white px-4 py-3 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/35">Catalogue</div>
          <div className="mt-1 text-sm font-semibold text-ink">{totalPublished} of {totalProducts} products live</div>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white px-4 py-3 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/35">Payment</div>
          <div className="mt-1 text-sm font-semibold text-ink">{normalizePaymentMode(storefrontBusiness.storefrontPaymentMode).split('_').join(' ').toLowerCase()}</div>
        </div>
      </div>

      <FormError error={searchParams?.error} />

      {searchParams?.saved === '1' ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          Storefront settings saved.
        </div>
      ) : null}
      {searchParams?.saved === 'stock' ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          Out-of-stock products hidden from the storefront.
        </div>
      ) : null}
      {searchParams?.saved === 'categories' ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          Public category mappings saved.
        </div>
      ) : null}

      {storefrontBusiness.storefrontEnabled && absoluteStorefrontUrl ? (
        <SettingsSection
          title="Storefront access"
          description="Link, QR code, and printable poster customers can find you with."
          eyebrow="Share"
          defaultOpen
        >
          <StorefrontAccessCard
            storeName={storefrontBusiness.name}
            storefrontUrl={absoluteStorefrontUrl}
            storeAddress={(business as any).address ?? null}
            storePhone={(business as any).phone ?? null}
            brandPrimaryColor={storefrontPrimaryColor}
          />
        </SettingsSection>
      ) : null}

      {searchParams?.saved === 'hours' ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          Pickup hours saved.
        </div>
      ) : null}

      <form action={updateStorefrontSettingsAction} className="space-y-4">
        <SettingsSection
          title="Store identity & branding"
          description="Public name, headline, description, and brand colours."
          eyebrow="Identity"
          defaultOpen
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="lg:col-span-2 flex items-center gap-3 rounded-2xl border border-black/5 bg-black/[0.03] px-4 py-4">
              <input
                id="storefrontEnabled"
                name="storefrontEnabled"
                type="checkbox"
                className="h-4 w-4"
                defaultChecked={storefrontBusiness.storefrontEnabled}
              />
              <label htmlFor="storefrontEnabled" className="text-sm font-medium text-ink">
                Enable public storefront and online checkout
              </label>
            </div>

            <div>
              <label className="label">Storefront slug</label>
              <input
                className="input"
                name="storefrontSlug"
                defaultValue={storefrontBusiness.storefrontSlug ?? storefrontBusiness.name}
                placeholder="your-business-name"
              />
              <div className="mt-1 text-xs text-black/50">This becomes the public path customers open online.</div>
            </div>

            <div>
              <label className="label">Public link</label>
              <div className="input flex items-center bg-black/[0.03] text-sm text-black/60 overflow-hidden">
                <span className="truncate">
                  {absoluteStorefrontUrl ?? publicUrl ?? 'Save a slug to generate the link'}
                </span>
              </div>
              {absoluteStorefrontUrl ? (
                <a href={absoluteStorefrontUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-semibold text-accent hover:underline">
                  Open storefront ↗
                </a>
              ) : publicUrl ? (
                <a href={publicUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-semibold text-accent hover:underline">
                  Open storefront ↗
                </a>
              ) : null}
            </div>

            <div className="lg:col-span-2">
              <label className="label">Headline</label>
              <input
                className="input"
                name="storefrontHeadline"
                defaultValue={storefrontBusiness.storefrontHeadline ?? ''}
                placeholder="Fresh groceries ready for pickup"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="label">Description</label>
              <textarea
                className="input min-h-24"
                name="storefrontDescription"
                defaultValue={storefrontBusiness.storefrontDescription ?? ''}
                placeholder="Tell customers what they can expect from your online shop."
              />
            </div>
          </div>

          <StorefrontBrandingCard
            defaultLogoUrl={storefrontBusiness.storefrontLogoUrl ?? ''}
            defaultPrimaryColor={storefrontPrimaryColor}
            defaultAccentColor={storefrontBusiness.storefrontAccentColor ?? ''}
            defaultTagline={storefrontBusiness.storefrontTagline ?? ''}
          basicBrandingEnabled={basicBrandingEnabled}
          extendedBrandingEnabled={extendedBrandingEnabled}
        />
        </SettingsSection>

        <SettingsSection
          title="Ordering & payment"
          description="Choose how customers place orders and see payment instructions."
          eyebrow="Checkout"
          defaultOpen
        >
          <StorefrontPaymentModeCard
            defaultMode={normalizePaymentMode(storefrontBusiness.storefrontPaymentMode)}
            defaultMomoNumber={storefrontBusiness.storefrontMomoNumber ?? ''}
            defaultMomoNetwork={storefrontBusiness.storefrontMomoNetwork ?? ''}
            defaultMerchantShortcode={storefrontBusiness.storefrontMerchantShortcode ?? ''}
            defaultBankName={storefrontBusiness.storefrontBankName ?? ''}
            defaultBankAccountName={storefrontBusiness.storefrontBankAccountName ?? ''}
            defaultBankAccountNumber={storefrontBusiness.storefrontBankAccountNumber ?? ''}
            defaultBankBranch={storefrontBusiness.storefrontBankBranch ?? ''}
            defaultPaymentNote={storefrontBusiness.storefrontPaymentNote ?? ''}
          />
        </SettingsSection>

        <SettingsSection
          title="SMS notifications"
          description="Send customers automatic SMS updates when their order status changes."
          eyebrow="Messaging"
          defaultOpen={false}
        >
          {(() => {
            const hubtelConfigured = Boolean(
              process.env.HUBTEL_CLIENT_ID && process.env.HUBTEL_CLIENT_SECRET,
            );
            const arkeselConfigured = Boolean(process.env.ARKESEL_API_KEY);
            const smsConfigured = hubtelConfigured || arkeselConfigured;
            return (
              <div className="space-y-4">
                {smsConfigured ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                      <span className="text-base">✅</span>
                      <span>
                        <strong>SMS provider connected</strong> via{' '}
                        {hubtelConfigured ? 'Hubtel' : 'Arkesel'}.
                      </span>
                    </div>
                    {arkeselConfigured && !hubtelConfigured && (
                      <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-2 text-xs text-blue-800 space-y-1">
                        <p className="font-medium">Arkesel checklist</p>
                        <ul className="list-disc pl-4 space-y-0.5 text-blue-700">
                          <li>Using the <strong>Main API key</strong> (not a sub-key) from Arkesel → SMS → API → Main SMS API Info</li>
                          <li>Sender ID <strong>&quot;TillFlow&quot;</strong> is registered — go to Arkesel → SMS → Sender IDs to check or add it</li>
                          <li>Account has SMS credits (check balance on your Arkesel dashboard)</li>
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-3">
                    <p className="font-semibold">⚠️ SMS provider not connected</p>
                    <div>
                      <p className="font-medium text-amber-800 mb-1">Option A — Arkesel (recommended, simpler)</p>
                      <p className="text-amber-700 text-xs mb-1">
                        Sign up free at <strong>account.arkesel.com</strong> → SMS → API → <strong>Main SMS API Info</strong> → Generate new key → copy it.
                        You get 10 free credits instantly.
                      </p>
                      <p className="text-amber-700 text-xs mb-1 font-medium">⚠️ Use the Main API key, not a sub-key (sub-keys have no SMS balance by default).</p>
                      <code className="block font-mono text-xs text-amber-900 bg-amber-100 rounded px-2 py-1">ARKESEL_API_KEY</code>
                    </div>
                    <div>
                      <p className="font-medium text-amber-800 mb-1">Option B — Hubtel</p>
                      <ul className="space-y-0.5 font-mono text-xs text-amber-900">
                        <li>HUBTEL_CLIENT_ID</li>
                        <li>HUBTEL_CLIENT_SECRET</li>
                        <li>HUBTEL_SMS_SENDER_ID <span className="font-sans font-normal text-amber-700">(optional)</span></li>
                      </ul>
                      <p className="mt-1 text-xs text-amber-700">Get from <strong>developers.hubtel.com → Manage API Keys</strong>.</p>
                    </div>
                    <p className="text-xs text-amber-700">Add whichever key(s) you choose to your Vercel project environment variables, then redeploy.</p>
                  </div>
                )}
                <p className="text-sm text-black/55">
                  When enabled, customers receive a short branded SMS at key moments: order placed, payment confirmed, ready for pickup, and cancellation. Standard SMS rates apply — disabled by default.
                </p>
                <label className="flex items-center gap-3 rounded-2xl border border-black/5 bg-black/[0.03] px-4 py-3">
                  <input
                    type="checkbox"
                    name="smsNotificationsEnabled"
                    defaultChecked={storefrontBusiness.smsNotificationsEnabled}
                    className="h-4 w-4"
                    disabled={!smsConfigured}
                  />
                  <span className={`text-sm font-medium ${smsConfigured ? 'text-ink' : 'text-black/40'}`}>
                    Enable SMS order notifications{!smsConfigured ? ' (requires SMS provider connection above)' : ''}
                  </span>
                </label>
                <div>
                  <label className="label">
                    Custom sender ID{' '}
                    <span className="font-normal text-black/40">(optional)</span>
                  </label>
                  <input
                    className="input max-w-xs"
                    name="smsSenderId"
                    defaultValue={storefrontBusiness.smsSenderId ?? ''}
                    placeholder="TillFlow"
                    maxLength={11}
                  />
                  <div className="mt-1 text-xs text-black/50">
                    Leave blank to use <strong>TillFlow</strong> as the sender. Custom sender IDs (max 11 chars) must be pre-approved by your SMS provider.
                  </div>
                </div>
              </div>
            );
          })()}
        </SettingsSection>

        <button type="submit" className="btn-primary">
          Save storefront settings
        </button>
      </form>

      <SettingsSection
        title="Pickup settings"
        description="Opening hours and preparation time shown on the public storefront."
        eyebrow="Operations"
        defaultOpen={false}
      >
        {(() => {
          const parsedHours = parseWeeklyHours(storefrontBusiness.storefrontHoursJson);
          const hoursEnabled = Boolean(parsedHours);
          const hours = parsedHours ?? makeDefaultWeeklyHours();
          const prepMinutes = storefrontBusiness.storefrontPickupPrepMinutes ?? 0;
          return (
            <div className="space-y-4">
              <p className="text-sm text-black/55">
                When set, customers see a green &ldquo;Open now · Ready in ~X min&rdquo; badge — or &ldquo;Closed · Opens at HH:MM&rdquo; outside hours.
              </p>
              <form action={updateStorefrontHoursAction} className="space-y-4">
              <div>
                <label className="label">Pickup instructions</label>
                <textarea
                  className="input min-h-24"
                  name="storefrontPickupInstructions"
                  defaultValue={storefrontBusiness.storefrontPickupInstructions ?? ''}
                  placeholder="Example: Pick up at the main counter after confirming your order number."
                />
                <div className="mt-1 text-xs text-black/50">
                  Shown to customers after checkout and on their order status page.
                </div>
              </div>

              <label className="flex items-center gap-3 rounded-2xl border border-black/5 bg-black/[0.03] px-4 py-3">
                <input
                  type="checkbox"
                  name="hoursEnabled"
                  defaultChecked={hoursEnabled}
                  className="h-4 w-4"
                />
                <span className="text-sm font-medium text-ink">Show pickup hours on the public storefront</span>
              </label>

              <div className="grid gap-3">
                {DAY_KEYS.map((day) => {
                  const config = hours[day];
                  return (
                    <div
                      key={day}
                      className="grid grid-cols-[72px_minmax(94px,1fr)_minmax(94px,1fr)] items-center gap-2 rounded-2xl border border-black/5 bg-white px-3 py-3 sm:grid-cols-[120px_minmax(104px,1fr)_minmax(104px,1fr)_auto] sm:gap-3 sm:px-4"
                    >
                      <div className="text-sm font-medium text-ink">{DAY_LABELS[day]}</div>
                      <input
                        className="input min-w-[94px] px-2 text-sm"
                        type="time"
                        name={`${day}_open`}
                        defaultValue={config.open}
                        disabled={config.closed}
                      />
                      <input
                        className="input min-w-[94px] px-2 text-sm"
                        type="time"
                        name={`${day}_close`}
                        defaultValue={config.close}
                        disabled={config.closed}
                      />
                      <label className="col-span-3 flex items-center gap-2 text-xs text-black/65 sm:col-span-1">
                        <input
                          type="checkbox"
                          name={`${day}_closed`}
                          defaultChecked={config.closed}
                          className="h-4 w-4"
                        />
                        Closed
                      </label>
                    </div>
                  );
                })}
              </div>

              <div>
                <label className="label">Pickup preparation time (minutes)</label>
                <input
                  className="input max-w-xs"
                  type="number"
                  name="pickupPrepMinutes"
                  min={0}
                  max={1440}
                  defaultValue={prepMinutes}
                />
                <div className="mt-1 text-xs text-black/50">
                  Used to render the "Ready in ~X min" line on the storefront when open. Set to 0 to hide it.
                </div>
              </div>

              <button type="submit" className="btn-primary">
                Save pickup hours
              </button>
              </form>
            </div>
          );
        })()}
      </SettingsSection>

      <SettingsSection
        title="Public category cleanup"
        description="Merge messy imported categories into customer-friendly shopping sections."
        eyebrow="Merchandising"
        defaultOpen={false}
      >
        <form action={updateStorefrontCategoryMappingsAction} className="space-y-4">
          <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-950">
            These labels only affect the public storefront. Your internal product categories stay unchanged.
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {suggestedPublicCategoryOptions().map((option) => (
              <span key={option.name} className="rounded-2xl border border-black/5 bg-white px-3 py-2 text-xs font-semibold text-black/55">
                {option.name}
              </span>
            ))}
          </div>
          <div className="divide-y divide-black/5 overflow-hidden rounded-2xl border border-black/5 bg-white">
            {categorySummaries.map((category) => {
              const existing = mappingByRaw.get(category.name.toLowerCase());
              const suggested = normalizePublicCategoryName(category.name);
              const publicName = existing?.publicCategoryName ?? suggested.name;
              const priority = existing?.priority ?? suggested.priority;
              return (
                <div key={category.id} className="grid gap-3 px-3 py-3 sm:grid-cols-[1.15fr_1fr_5rem_auto] sm:items-center">
                  <input type="hidden" name="rawCategoryName" value={category.name} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink">{category.name}</div>
                    <div className="text-xs text-black/45">{category.total} products, {category.published} live</div>
                    <div className="mt-1 text-[11px] text-black/55">
                      Public storefront label: <span className="font-semibold text-ink">{publicName}</span>
                    </div>
                  </div>
                  <div>
                    <label className="label sm:hidden">Public category</label>
                    <input
                      className="input h-11"
                      name={`publicCategoryName:${category.name}`}
                      defaultValue={publicName}
                      list="storefront-public-category-options"
                    />
                    <div className="mt-1 text-[10px] text-black/40">
                      Pick a suggestion or type a custom shopper-friendly name.
                    </div>
                  </div>
                  <div>
                    <label className="label sm:hidden">Order</label>
                    <input className="input h-11" name={`priority:${category.name}`} type="number" min={0} max={999} defaultValue={priority} />
                  </div>
                  <label className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-black/60">
                    <input type="checkbox" name={`hidden:${category.name}`} defaultChecked={Boolean(existing?.hidden)} />
                    Hide
                  </label>
                </div>
              );
            })}
          </div>
          <datalist id="storefront-public-category-options">
            {suggestedPublicCategoryOptions().map((option) => (
              <option key={option.name} value={option.name} />
            ))}
          </datalist>
          <button type="submit" className="btn-primary">
            Save public categories
          </button>
        </form>
      </SettingsSection>

      <SettingsSection
        title="Catalogue visibility"
        description={`${totalPublished} of ${totalProducts} products visible online`}
        badge={`${totalPublished}/${totalProducts}`}
        eyebrow="Products"
        defaultOpen={false}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <form action={bulkSetStorefrontPublishAction}>
              <input type="hidden" name="publish" value="1" />
              <button type="submit" className="btn-primary text-sm" disabled={totalProducts === 0 || totalPublished === totalProducts}>
                Publish all products
              </button>
            </form>
            <form action={bulkSetStorefrontPublishAction}>
              <input type="hidden" name="publish" value="0" />
              <button type="submit" className="btn-secondary text-sm" disabled={totalPublished === 0}>
                Hide all products
              </button>
            </form>
            <form action={hideOutOfStockStorefrontProductsAction}>
              <button type="submit" className="btn-secondary text-sm" disabled={publishedOutOfStock === 0}>
                Hide out-of-stock products
              </button>
            </form>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
            {publishedOutOfStock > 0
              ? `${publishedOutOfStock} published product${publishedOutOfStock === 1 ? '' : 's'} currently show as out of stock. Hide them now to keep the storefront cleaner for customers.`
              : 'No published products are currently out of stock.'}
          </div>
        {categoryPublishSummaries.length > 1 ? (
          <div className="mt-4 rounded-2xl border border-black/5 bg-black/[0.02] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/55">Publish by category</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {categoryPublishSummaries.map((category) => {
                const allPublished = category.published === category.total;
                const nonePublished = category.published === 0;
                return (
                  <div
                    key={category.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-black/5 bg-white px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-ink">{category.name}</div>
                      <div className="text-xs text-black/55">{category.published} of {category.total} published</div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <form action={bulkSetStorefrontPublishAction}>
                        <input type="hidden" name="publish" value="1" />
                        <input type="hidden" name="categoryId" value={category.id === '__uncategorised__' ? '' : category.id} />
                        <button
                          type="submit"
                          className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[11px] font-semibold text-accent transition hover:bg-accent/20 disabled:opacity-40"
                          disabled={allPublished || category.id === '__uncategorised__'}
                          title={category.id === '__uncategorised__' ? 'Assign these to a category first' : ''}
                        >
                          Publish
                        </button>
                      </form>
                      <form action={bulkSetStorefrontPublishAction}>
                        <input type="hidden" name="publish" value="0" />
                        <input type="hidden" name="categoryId" value={category.id === '__uncategorised__' ? '' : category.id} />
                        <button
                          type="submit"
                          className="rounded-full border border-black/10 bg-white px-3 py-1 text-[11px] font-semibold text-black/65 transition hover:border-black/20 disabled:opacity-40"
                          disabled={nonePublished || category.id === '__uncategorised__'}
                          title={category.id === '__uncategorised__' ? 'Assign these to a category first' : ''}
                        >
                          Hide
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-display font-semibold">Published products</h3>
            <p className="mt-1 text-sm text-black/55">
              Only products marked as published appear in the public storefront.
            </p>
          </div>
          <a href="/products" className="btn-secondary justify-center text-sm">
            Open products
          </a>
        </div>

        <div className="mt-5">
          <CatalogueVisibilityFilter initialTotal={totalProducts} />
        </div>
        </div>
      </SettingsSection>
      <SettingsSection
        title="Storefront analytics"
        description="Last 30 days of customer activity from the public storefront."
        eyebrow="Insights"
        defaultOpen={false}
      >
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-5">
            {[
              ['Visits', visits],
              ['Add to cart', addToCart],
              ['Checkout starts', checkoutStarts],
              ['Orders placed', ordersPlaced],
              ['Conversion', `${conversionRate}%`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-black/5 bg-white px-4 py-3 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-black/35">{label}</div>
                <div className="mt-1 text-xl font-black text-ink">{value}</div>
              </div>
            ))}
          </div>
          <div className="rounded-3xl border border-black/5 bg-slate-50 p-5">
            <h3 className="font-display font-bold text-ink">What to do with this</h3>
            <p className="mt-2 text-sm leading-6 text-black/55">
              If visits are healthy but add-to-cart is low, improve product photos and category names. If checkout starts are healthy but orders are low, review payment instructions and pickup confidence.
            </p>
            <div className="pt-1">
              <Link
                href="/settings/online-store/analytics"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
              >
                View full analytics →
              </Link>
            </div>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
