import FormError from '@/components/FormError';
import PageHeader from '@/components/PageHeader';
import AdvancedModeNotice from '@/components/AdvancedModeNotice';
import { toggleStorefrontProductAction, updateStorefrontSettingsAction, updateStorefrontHoursAction, bulkSetStorefrontPublishAction } from '@/app/actions/online-storefront';
import { requireBusiness } from '@/lib/auth';
import { getFeatures } from '@/lib/features';
import { prisma } from '@/lib/prisma';
import { DAY_KEYS, DAY_LABELS, makeDefaultWeeklyHours, parseWeeklyHours } from '@/lib/business-hours';
import { headers } from 'next/headers';
import StorefrontPaymentModeCard from '@/components/StorefrontPaymentModeCard';
import StorefrontAccessCard from '@/components/StorefrontAccessCard';
import StorefrontBrandingCard from '@/components/StorefrontBrandingCard';
import { normalizePaymentMode } from '@/lib/storefront-payments';
import { buildStorefrontUrl } from '@/lib/storefront-url';
import { hasPlanAccess, getBusinessPlan } from '@/lib/features';

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div className="space-y-1 px-1 pt-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-accent">{eyebrow}</div>
      <h2 className="text-xl font-display font-bold text-ink">{title}</h2>
      {description ? <p className="text-sm text-black/55">{description}</p> : null}
    </div>
  );
}

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

  const [storefrontBusiness, products] = await Promise.all([
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
      },
    }),
    prisma.product.findMany({
      where: { businessId: business.id, active: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        storefrontPublished: true,
        sellingPriceBasePence: true,
        categoryId: true,
        category: { select: { name: true } },
      },
    }),
  ]);

  const categoryStats = (() => {
    const map = new Map<string, { id: string; name: string; total: number; published: number }>();
    for (const product of products) {
      const id = product.categoryId ?? '__uncategorised__';
      const name = product.category?.name ?? 'Uncategorised';
      const entry = map.get(id) ?? { id, name, total: 0, published: 0 };
      entry.total += 1;
      if (product.storefrontPublished) entry.published += 1;
      map.set(id, entry);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  })();
  const totalProducts = products.length;
  const totalPublished = products.filter((p) => p.storefrontPublished).length;

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Online Storefront"
        subtitle="Publish a public catalogue, accept mobile-money checkout, and manage pickup orders from TillFlow."
      />

      <FormError error={searchParams?.error} />

      {searchParams?.saved === '1' ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          Storefront settings saved.
        </div>
      ) : null}

      {storefrontBusiness.storefrontEnabled && absoluteStorefrontUrl ? (
        <>
          <SectionHeading
            eyebrow="1 · Storefront access"
            title="Storefront access"
            description="Link, QR code, and printable poster customers can find you with."
          />
          <StorefrontAccessCard
            storeName={storefrontBusiness.name}
            storefrontUrl={absoluteStorefrontUrl}
            storeAddress={(business as any).address ?? null}
            storePhone={(business as any).phone ?? null}
            brandPrimaryColor={storefrontBusiness.storefrontPrimaryColor ?? null}
          />
        </>
      ) : null}

      {searchParams?.saved === 'hours' ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          Pickup hours saved.
        </div>
      ) : null}

      <form action={updateStorefrontSettingsAction} className="space-y-6">
        <input
          type="hidden"
          name="storefrontPickupInstructions"
          value={storefrontBusiness.storefrontPickupInstructions ?? ''}
        />

        <SectionHeading
          eyebrow="2 · Store identity"
          title="Store identity"
          description="Public name, description, and storefront branding."
        />

        <div className="card p-6">
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
              <div className="input flex items-center bg-black/[0.03] text-sm text-black/60">
                {publicUrl ? publicUrl : 'Save a slug to generate the link'}
              </div>
              {publicUrl ? (
                <a href={publicUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-semibold text-accent hover:underline">
                  Open storefront
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
        </div>

        <StorefrontBrandingCard
          defaultLogoUrl={storefrontBusiness.storefrontLogoUrl ?? ''}
          defaultPrimaryColor={storefrontBusiness.storefrontPrimaryColor ?? ''}
          defaultAccentColor={storefrontBusiness.storefrontAccentColor ?? ''}
          defaultTagline={storefrontBusiness.storefrontTagline ?? ''}
          basicBrandingEnabled={basicBrandingEnabled}
          extendedBrandingEnabled={extendedBrandingEnabled}
        />

        <SectionHeading
          eyebrow="3 · Ordering & payment"
          title="Ordering & payment"
          description="Choose how customers place orders and see payment instructions."
        />

        <div className="card p-6">
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
        </div>

        <button type="submit" className="btn-primary">
          Save storefront settings
        </button>
      </form>

      <SectionHeading
        eyebrow="4 · Pickup settings"
        title="Pickup settings"
        description="Opening hours and the preparation time shown on the public storefront."
      />

      {(() => {
        const parsedHours = parseWeeklyHours(storefrontBusiness.storefrontHoursJson);
        const hoursEnabled = Boolean(parsedHours);
        const hours = parsedHours ?? makeDefaultWeeklyHours();
        const prepMinutes = storefrontBusiness.storefrontPickupPrepMinutes ?? 0;
        return (
          <div className="card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-display font-semibold">Pickup hours</h2>
                <p className="mt-1 text-sm text-black/55">
                  When set, customers see a green "Open now · Ready in ~X min" badge — or "Closed · Opens at HH:MM" outside hours. Times are in the business timezone.
                </p>
              </div>
            </div>

            <form action={updateStorefrontHoursAction} className="mt-5 space-y-4">
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
                      className="grid grid-cols-[76px_86px_86px_auto] items-center gap-2 rounded-2xl border border-black/5 bg-white px-3 py-3 sm:grid-cols-[120px_minmax(104px,1fr)_minmax(104px,1fr)_auto] sm:gap-3 sm:px-4"
                    >
                      <div className="text-sm font-medium text-ink">{DAY_LABELS[day]}</div>
                      <input
                        className="input min-w-[86px] px-2 text-sm"
                        type="time"
                        name={`${day}_open`}
                        defaultValue={config.open}
                        disabled={config.closed}
                      />
                      <input
                        className="input min-w-[86px] px-2 text-sm"
                        type="time"
                        name={`${day}_close`}
                        defaultValue={config.close}
                        disabled={config.closed}
                      />
                      <label className="flex items-center gap-2 text-xs text-black/65">
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

      <SectionHeading
        eyebrow="5 · Catalogue visibility"
        title="Catalogue visibility"
        description="Bulk publish or hide products. Per-category controls let you bring whole sections online at once."
      />

      <div className="card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-display font-semibold">Catalogue visibility</h2>
            <p className="mt-1 text-sm text-black/55">
              Bulk publish or hide products. {totalPublished} of {totalProducts} active products are currently visible online.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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
          </div>
        </div>

        {categoryStats.length > 1 ? (
          <div className="mt-4 rounded-2xl border border-black/5 bg-black/[0.02] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/55">Publish by category</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {categoryStats.map((category) => {
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

        <div className="mt-5 space-y-3">
          {products.map((product) => (
            <div key={product.id} className="flex flex-col gap-4 rounded-2xl border border-black/5 bg-black/[0.02] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                {product.imageUrl ? (
                  <img src={product.imageUrl} alt={product.name} className="h-12 w-12 rounded-xl object-cover" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accentSoft text-lg font-bold text-accent">
                    {product.name.charAt(0)}
                  </div>
                )}
                <div>
                  <div className="font-medium text-ink">{product.name}</div>
                  <div className="text-xs text-black/50">
                    {product.storefrontPublished ? 'Visible online' : 'Hidden from storefront'}
                  </div>
                </div>
              </div>

              <form action={toggleStorefrontProductAction}>
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="publish" value={product.storefrontPublished ? '0' : '1'} />
                <button type="submit" className={product.storefrontPublished ? 'btn-ghost' : 'btn-primary'}>
                  {product.storefrontPublished ? 'Hide from storefront' : 'Publish online'}
                </button>
              </form>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
