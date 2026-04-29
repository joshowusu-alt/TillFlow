import FormError from '@/components/FormError';
import PageHeader from '@/components/PageHeader';
import AdvancedModeNotice from '@/components/AdvancedModeNotice';
import { toggleStorefrontProductAction, updateStorefrontSettingsAction, updateStorefrontHoursAction } from '@/app/actions/online-storefront';
import { requireBusiness } from '@/lib/auth';
import { getFeatures } from '@/lib/features';
import { prisma } from '@/lib/prisma';
import { DAY_KEYS, DAY_LABELS, makeDefaultWeeklyHours, parseWeeklyHours } from '@/lib/business-hours';

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
      },
    }),
  ]);

  if (!storefrontBusiness) {
    return <div className="card p-6">Business not found.</div>;
  }

  const publicUrl = storefrontBusiness.storefrontSlug
    ? `/shop/${storefrontBusiness.storefrontSlug}`
    : null;

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

      {searchParams?.saved === 'hours' ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          Pickup hours saved.
        </div>
      ) : null}

      <div className="card p-6">
        <form action={updateStorefrontSettingsAction} className="grid gap-4 lg:grid-cols-2">
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

          <div className="lg:col-span-2">
            <label className="label">Pickup instructions</label>
            <textarea
              className="input min-h-24"
              name="storefrontPickupInstructions"
              defaultValue={storefrontBusiness.storefrontPickupInstructions ?? ''}
              placeholder="Example: Pick up at the main counter after confirming your order number."
            />
          </div>

          <div className="lg:col-span-2 rounded-2xl border border-black/5 bg-black/[0.03] px-4 py-4">
            <div className="text-sm font-semibold text-ink">Mobile money payout</div>
            <p className="mt-1 text-xs text-black/55">
              Customers send manual MoMo payments to this number using their order reference. Shown on the order confirmation page.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_180px]">
              <div>
                <label className="label">MoMo number</label>
                <input
                  className="input"
                  name="storefrontMomoNumber"
                  defaultValue={storefrontBusiness.storefrontMomoNumber ?? ''}
                  placeholder="e.g. 024 123 4567"
                />
              </div>
              <div>
                <label className="label">Network</label>
                <select
                  className="input"
                  name="storefrontMomoNetwork"
                  defaultValue={storefrontBusiness.storefrontMomoNetwork ?? ''}
                >
                  <option value="">Not set</option>
                  <option value="MTN">MTN</option>
                  <option value="TELECEL">Telecel</option>
                  <option value="AIRTELTIGO">AirtelTigo</option>
                </select>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <button type="submit" className="btn-primary">
              Save storefront settings
            </button>
          </div>
        </form>
      </div>

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
                      className="grid grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-black/5 bg-white px-4 py-3"
                    >
                      <div className="text-sm font-medium text-ink">{DAY_LABELS[day]}</div>
                      <input
                        className="input"
                        type="time"
                        name={`${day}_open`}
                        defaultValue={config.open}
                        disabled={config.closed}
                      />
                      <input
                        className="input"
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

      <div className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-display font-semibold">Published products</h2>
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
