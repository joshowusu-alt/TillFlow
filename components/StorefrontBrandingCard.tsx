'use client';

import { useState } from 'react';

type Props = {
  defaultLogoUrl: string;
  defaultPrimaryColor: string;
  defaultAccentColor: string;
  defaultTagline: string;
  /** GROWTH+ unlocks logo + primary colour. */
  basicBrandingEnabled: boolean;
  /** PRO unlocks accent colour + tagline. */
  extendedBrandingEnabled: boolean;
};

export default function StorefrontBrandingCard({
  defaultLogoUrl,
  defaultPrimaryColor,
  defaultAccentColor,
  defaultTagline,
  basicBrandingEnabled,
  extendedBrandingEnabled,
}: Props) {
  const [primary, setPrimary] = useState(defaultPrimaryColor || '#1E40AF');
  const [accent, setAccent] = useState(defaultAccentColor || '#3B82F6');

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-display font-semibold">Storefront branding</h2>
          <p className="mt-1 text-sm text-black/55">
            Make the storefront feel like your store. Layout, typography, and status colours stay fixed for trust and accessibility.
          </p>
        </div>
      </div>

      {!basicBrandingEnabled ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Storefront branding is available on Growth and Pro plans. Speak to TillFlow to upgrade.
        </div>
      ) : (
        <div className="mt-4 grid gap-4">
          <div>
            <label className="label">Logo URL</label>
            <input
              className="input"
              type="url"
              name="storefrontLogoUrl"
              defaultValue={defaultLogoUrl}
              placeholder="https://example.com/logo.png"
              disabled={!basicBrandingEnabled}
            />
            <div className="mt-1 text-xs text-black/55">
              Square or wide logo at 256px+ works best. Falls back to your business initials when blank.
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Primary colour</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  name="storefrontPrimaryColor"
                  value={primary}
                  onChange={(event) => setPrimary(event.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-xl border border-black/10 bg-white"
                  disabled={!basicBrandingEnabled}
                />
                <input
                  type="text"
                  value={primary}
                  onChange={(event) => setPrimary(event.target.value)}
                  className="input flex-1 font-mono text-sm"
                  pattern="^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$"
                  disabled={!basicBrandingEnabled}
                />
              </div>
              <div className="mt-1 text-xs text-black/55">Used for the hero accent, monogram tile, and primary CTA.</div>
            </div>

            <div>
              <label className="label flex items-center gap-2">
                Accent colour
                {!extendedBrandingEnabled ? (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                    Pro
                  </span>
                ) : null}
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  name="storefrontAccentColor"
                  value={accent}
                  onChange={(event) => setAccent(event.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-xl border border-black/10 bg-white disabled:opacity-50"
                  disabled={!extendedBrandingEnabled}
                />
                <input
                  type="text"
                  value={accent}
                  onChange={(event) => setAccent(event.target.value)}
                  className="input flex-1 font-mono text-sm"
                  pattern="^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$"
                  disabled={!extendedBrandingEnabled}
                />
              </div>
              <div className="mt-1 text-xs text-black/55">Subtle accent for badges, highlights, and the QR poster.</div>
            </div>
          </div>

          <div>
            <label className="label flex items-center gap-2">
              Tagline
              {!extendedBrandingEnabled ? (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                  Pro
                </span>
              ) : null}
            </label>
            <input
              className="input"
              name="storefrontTagline"
              defaultValue={defaultTagline}
              placeholder="e.g. Fresh groceries — ready when you are"
              maxLength={100}
              disabled={!extendedBrandingEnabled}
            />
            <div className="mt-1 text-xs text-black/55">Shown beneath the storefront name. Keep it short — under 100 characters.</div>
          </div>
        </div>
      )}
    </div>
  );
}
