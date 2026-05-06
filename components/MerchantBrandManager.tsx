'use client';

import { useMemo, useState } from 'react';
import SubmitButton from '@/components/SubmitButton';
import BrandAssetUploaderCard from '@/components/BrandAssetUploaderCard';
import MerchantBrandBadge from '@/components/MerchantBrandBadge';
import {
  getMerchantCompactBrandGuidance,
  resolveMerchantBrandPresentation,
  type MerchantBrandProfile,
} from '@/lib/merchant-branding';

type Props = {
  businessName: string;
  initialBranding: Omit<MerchantBrandProfile, 'businessName'>;
  action: (formData: FormData) => void | Promise<void>;
};

function PreviewCard({
  title,
  subtitle,
  renderingNote,
  children,
}: {
  title: string;
  subtitle: string;
  renderingNote?: { text: string; wasFallback: boolean } | null;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/45">{title}</div>
      <div className="mt-1 text-sm text-black/55">{subtitle}</div>
      <div className="mt-4">{children}</div>
      {renderingNote && (
        <div
          className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs ${
            renderingNote.wasFallback ? 'bg-amber-50 text-amber-800' : 'bg-slate-50 text-slate-600'
          }`}
        >
          <span
            className={`mt-px shrink-0 font-bold uppercase tracking-widest text-[9px] ${
              renderingNote.wasFallback ? 'text-amber-500' : 'text-slate-400'
            }`}
          >
            {renderingNote.wasFallback ? 'Smart fallback' : 'Render choice'}
          </span>
          <span>{renderingNote.text}</span>
        </div>
      )}
    </div>
  );
}

export default function MerchantBrandManager({ businessName, initialBranding, action }: Props) {
  const [logoUrl, setLogoUrl] = useState(initialBranding.logoUrl);
  const [brandCompactLogoUrl, setBrandCompactLogoUrl] = useState(initialBranding.brandCompactLogoUrl);
  const [brandSquareLogoUrl, setBrandSquareLogoUrl] = useState(initialBranding.brandSquareLogoUrl);
  const [brandInitials, setBrandInitials] = useState(initialBranding.brandInitials ?? '');
  const [brandPrimaryColor, setBrandPrimaryColor] = useState(initialBranding.brandPrimaryColor ?? '#2563eb');
  const [brandCompactMode, setBrandCompactMode] = useState(initialBranding.brandCompactMode ?? 'AUTO');
  const [brandLogoBackground, setBrandLogoBackground] = useState(initialBranding.brandLogoBackground ?? 'AUTO');

  const branding = useMemo<MerchantBrandProfile>(
    () => ({
      businessName,
      logoUrl,
      brandCompactLogoUrl,
      brandSquareLogoUrl,
      receiptLogoUrl: initialBranding.receiptLogoUrl,
      storefrontLogoUrl: initialBranding.storefrontLogoUrl,
      storefrontPrimaryColor: initialBranding.storefrontPrimaryColor,
      storefrontTagline: initialBranding.storefrontTagline,
      brandInitials,
      brandPrimaryColor,
      brandCompactMode,
      brandLogoBackground,
    }),
    [
      brandCompactLogoUrl,
      brandCompactMode,
      brandInitials,
      brandLogoBackground,
      brandPrimaryColor,
      brandSquareLogoUrl,
      businessName,
      initialBranding.receiptLogoUrl,
      initialBranding.storefrontLogoUrl,
      initialBranding.storefrontPrimaryColor,
      initialBranding.storefrontTagline,
      logoUrl,
    ],
  );

  const compactGuidance = getMerchantCompactBrandGuidance(branding);

  const presentations = useMemo(
    () => ({
      adminShell: resolveMerchantBrandPresentation(branding, 'admin-shell'),
      storefrontHero: resolveMerchantBrandPresentation(branding, 'storefront-hero'),
      receipt: resolveMerchantBrandPresentation(branding, 'receipt'),
      compactChip: resolveMerchantBrandPresentation(branding, 'compact-chip'),
    }),
    [branding],
  );

  return (
    <div className="space-y-6 rounded-[28px] border border-black/5 bg-gradient-to-br from-white to-slate-50/80 p-6 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-black/45">Brand identity</div>
          <h2 className="mt-1 text-xl font-display font-semibold text-ink">Merchant branding kit</h2>
          <p className="mt-2 max-w-3xl text-sm text-black/60">
            Upload your source assets once. TillFlow then chooses the right presentation for compact app
            surfaces, the public storefront, and receipt-style contexts so your branding stays clear and premium.
          </p>
        </div>
      </div>

      {compactGuidance ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-semibold">TillFlow recommendation:</span> {compactGuidance}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <BrandAssetUploaderCard
          assetKey="PRIMARY"
          title="Primary logo"
          description="Your main business logo. Used for storefront hero, large preview cards, and trust-building moments. TillFlow reserves this for surfaces with space to show it well."
          recommendation="Best for wide or full-width logos. TillFlow will not use this in compact headers or chips unless you explicitly allow it."
          currentUrl={logoUrl}
          businessName={businessName}
          onChange={setLogoUrl}
        />
        <BrandAssetUploaderCard
          assetKey="COMPACT"
          title="Compact logo / mark"
          description="Optional simplified mark for compact app chips, identity badges, and navigation areas. Should be a short wordmark or symbol only — no fine text."
          recommendation="Best for short wordmarks or symbol-plus-initial designs. TillFlow will prefer this over the primary logo on compact surfaces."
          currentUrl={brandCompactLogoUrl}
          businessName={businessName}
          onChange={setBrandCompactLogoUrl}
        />
        <BrandAssetUploaderCard
          assetKey="SQUARE"
          title="Square logo / icon"
          description="Optional square badge or icon for the smallest TillFlow surfaces — admin header chip, compact identity, mobile nav. Square or near-square only."
          recommendation="Best for app-style marks, square badges, or clean icon artwork. TillFlow will prefer this over compact and primary logos on chip-sized surfaces."
          currentUrl={brandSquareLogoUrl}
          businessName={businessName}
          previewTone="square"
          onChange={setBrandSquareLogoUrl}
        />
      </div>

      <form action={action} className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-4 rounded-2xl border border-black/5 bg-white p-5">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-black/45">Brand settings</div>
            <h3 className="mt-1 text-lg font-display font-semibold text-ink">How TillFlow should render you</h3>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Fallback initials</label>
              <input
                className="input"
                name="brandInitials"
                value={brandInitials}
                onChange={(event) => setBrandInitials(event.target.value.toUpperCase())}
                placeholder="ES"
                maxLength={3}
              />
              <div className="mt-1 text-xs text-black/50">
                Optional. Leave blank and TillFlow derives initials from your business name automatically.
              </div>
            </div>

            <div>
              <label className="label">Brand primary colour</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={brandPrimaryColor}
                  onChange={(event) => setBrandPrimaryColor(event.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-xl border border-black/10 bg-white"
                />
                <input
                  className="input flex-1 font-mono text-sm"
                  name="brandPrimaryColor"
                  value={brandPrimaryColor}
                  onChange={(event) => setBrandPrimaryColor(event.target.value)}
                  pattern="^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$"
                />
              </div>
              <div className="mt-1 text-xs text-black/50">
                Used for initials tiles, compact identity chips, and brand-coloured surfaces across TillFlow. Will not affect the storefront primary colour unless they are the same setting.
              </div>
            </div>
          </div>

          <div>
            <label className="label">Compact surface strategy</label>
            <select
              className="input"
              name="brandCompactMode"
              value={brandCompactMode}
              onChange={(event) => setBrandCompactMode(event.target.value)}
            >
              <option value="AUTO">Smart — use dedicated compact assets, fall back to initials (Recommended)</option>
              <option value="INITIALS">Always use initials in compact views</option>
              <option value="LOGO">Allow primary logo in compact views (may not look best)</option>
            </select>
            <div className="mt-1 text-xs text-black/50">
              Smart mode uses your square or compact logo in tight spaces and falls back to a premium initials tile if neither is uploaded. This protects the TillFlow admin shell and navigation areas from text-heavy or oversized logos.
            </div>
          </div>

          <div>
            <label className="label">Logo background style</label>
            <select
              className="input"
              name="brandLogoBackground"
              value={brandLogoBackground}
              onChange={(event) => setBrandLogoBackground(event.target.value)}
            >
              <option value="AUTO">Auto — TillFlow chooses the clearest frame (Recommended)</option>
              <option value="NEUTRAL">White tile — clean badge on any surface</option>
              <option value="SOFT_TILE">Soft tile — subtle neutral frame</option>
              <option value="TINTED_TILE">Tinted tile — brand-colour tinted frame</option>
              <option value="OUTLINE_TILE">Outline tile — white badge with brand border</option>
              <option value="TRANSPARENT">No background (transparent)</option>
            </select>
            <div className="mt-1 text-xs text-black/50">
              Auto selects the clearest frame per surface — neutral for compact shells, appropriate for hero and receipt contexts.
            </div>
          </div>

          <SubmitButton className="btn-primary w-fit" loadingText="Saving brand settings…">
            Save brand settings
          </SubmitButton>
        </div>

        <div className="space-y-4">
          <PreviewCard
            title="Admin header"
            subtitle="Compact surfaces protect TillFlow brand quality — primary logos are withheld unless a compact asset is uploaded."
            renderingNote={{ text: presentations.adminShell.reason, wasFallback: presentations.adminShell.wasFallbackUsed }}
          >
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-sm font-black text-white">
                    TF
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-ink">TillFlow</div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-black/45">
                      Premium operations
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-full border border-black/5 bg-slate-50 px-2.5 py-1.5">
                  <MerchantBrandBadge branding={branding} surface="admin-shell" />
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-ink">{businessName}</div>
                    <div className="text-[11px] text-black/45">Compact app identity</div>
                  </div>
                </div>
              </div>
            </div>
          </PreviewCard>

          <PreviewCard
            title="Storefront hero"
            subtitle="Large public-facing surfaces use your primary logo when available. Initials are used when no suitable logo is uploaded."
            renderingNote={{ text: presentations.storefrontHero.reason, wasFallback: presentations.storefrontHero.wasFallbackUsed }}
          >
            <div
              className="overflow-hidden rounded-[24px] p-4 text-white shadow-sm"
              style={{ backgroundColor: branding.storefrontPrimaryColor || brandPrimaryColor || '#2563eb' }}
            >
              <div className="flex items-start gap-3">
                <MerchantBrandBadge branding={branding} surface="storefront-hero" />
                <div className="min-w-0">
                  <div className="inline-flex items-center rounded-full bg-white/15 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em]">
                    TillFlow online store
                  </div>
                  <div className="mt-2 text-lg font-bold leading-tight sm:text-xl">{businessName}</div>
                  <div className="mt-1 text-sm text-white/80">
                    {branding.storefrontTagline || 'Fresh pickup, trusted pricing, and a premium storefront feel.'}
                  </div>
                  <div className="mt-3 inline-flex items-center rounded-full bg-white/12 px-2.5 py-1 text-xs font-semibold text-white/90">
                    Payment and pickup details stay clear
                  </div>
                </div>
              </div>
            </div>
          </PreviewCard>

          <div className="grid gap-4 md:grid-cols-2">
            <PreviewCard
              title="Receipt header"
              subtitle="Receipts use the most readable version available, prioritising compact marks over wide logos."
              renderingNote={{ text: presentations.receipt.reason, wasFallback: presentations.receipt.wasFallbackUsed }}
            >
              <div className="rounded-2xl border border-black/10 bg-white p-4 text-center shadow-sm">
                <MerchantBrandBadge branding={branding} surface="receipt" className="mx-auto" />
                <div className="mt-3 text-sm font-semibold text-ink">{businessName}</div>
                <div className="mt-1 text-xs text-black/50">24 Oxford Street, Accra</div>
              </div>
            </PreviewCard>

            <PreviewCard
              title="Compact chip"
              subtitle="Admin shell and identity chips always use the most compact-safe asset. Premium initials tile used when no suitable compact logo exists."
              renderingNote={{ text: presentations.compactChip.reason, wasFallback: presentations.compactChip.wasFallbackUsed }}
            >
              <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
                <div className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-slate-50 px-3 py-2">
                  <MerchantBrandBadge branding={branding} surface="compact-chip" />
                  <div className="text-left">
                    <div className="text-xs font-semibold text-ink">{businessName}</div>
                    <div className="text-[11px] text-black/45">
                      {presentations.compactChip.source === 'initials' ? 'TillFlow smart fallback' : 'Compact merchant asset'}
                    </div>
                  </div>
                </div>
              </div>
            </PreviewCard>
          </div>
        </div>
      </form>
    </div>
  );
}
