'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import SubmitButton from '@/components/SubmitButton';
import MerchantBrandBadge from '@/components/MerchantBrandBadge';
import { formatMoney } from '@/lib/format';
import type { MerchantBrandProfile } from '@/lib/merchant-branding';
import { updateReceiptDesignAction } from '@/app/actions/receipt-design';

export type ReceiptDesignValues = {
  address: string;
  phone: string;
  receiptHeader: string;
  receiptFooter: string;
  receiptLogoUrl: string;
  socialMediaHandle: string;
  receiptShowVatNumber: boolean;
  receiptShowAddress: boolean;
  receiptShowStorefrontQr: boolean;
};
type Props = {
  initialValues: ReceiptDesignValues;
  businessName: string;
  currency: string;
  vatNumber: string | null;
  merchantBranding: MerchantBrandProfile;
  storefrontEnabled: boolean;
  storefrontUrl: string | null;
  storefrontQrPreview: string | null;
};

export default function ReceiptDesignEditor({ initialValues, businessName, currency, vatNumber, merchantBranding, storefrontEnabled, storefrontUrl, storefrontQrPreview }: Props) {
  const [draft, setDraft] = useState(initialValues);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initialValues);
  function updatePreview(event: FormEvent<HTMLFormElement>) {
    const field = event.target;
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
    if (!(field.name in initialValues)) return;
    const value = field instanceof HTMLInputElement && field.type === 'checkbox' ? field.checked : field.value;
    setDraft(previous => ({ ...previous, [field.name]: value }));
  }
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.85fr)]">
      {/* Settings Form */}
      <div id="receipt-editor" className="card min-w-0 scroll-mt-6 p-4 sm:p-6">
        <h2 className="text-lg font-display font-semibold">Receipt Settings</h2>
        <form action={updateReceiptDesignAction} onChange={updatePreview} onReset={() => setDraft(initialValues)} className="mt-4 space-y-5">
          <fieldset disabled={!ready} className="min-w-0 space-y-4">
            <legend className="mb-3 font-semibold">Business contact</legend>
            {/* Business Details */}
            <div>
              <label className="label" htmlFor="receipt-address">Business Address</label>
              <textarea id="receipt-address"
                name="address"
                className="input min-h-20"
                placeholder="123 Main Street&#10;City, State 12345"
                defaultValue={initialValues.address ?? ''}
              />
              <div className="mt-1 text-xs text-black/50">Shared with your business profile. Shown on receipts when enabled.</div>
            </div>

            <div>
              <label className="label" htmlFor="receipt-phone">Phone Number</label>
              <input id="receipt-phone"
                type="text"
                name="phone"
                className="input"
                placeholder="+1 (555) 123-4567"
                defaultValue={initialValues.phone ?? ''}
              />
            </div>

          </fieldset>
          <fieldset disabled={!ready} className="min-w-0 space-y-4 border-t border-border pt-4">
            <legend className="px-1 font-semibold">Receipt messages</legend>
            {/* Custom Header */}
            <div>
              <label className="label" htmlFor="receipt-receiptHeader">Receipt Header</label>
              <textarea id="receipt-receiptHeader"
                name="receiptHeader"
                className="input min-h-16"
                placeholder="Welcome to our store!"
                defaultValue={initialValues.receiptHeader ?? ''}
              />
              <div className="mt-1 text-xs text-black/50">Custom message at the top of receipts</div>
            </div>

            {/* Custom Footer */}
            <div>
              <label className="label" htmlFor="receipt-receiptFooter">Receipt Footer</label>
              <textarea id="receipt-receiptFooter"
                name="receiptFooter"
                className="input min-h-16"
                placeholder="Thank you for shopping with us!&#10;Returns accepted within 7 days."
                defaultValue={initialValues.receiptFooter ?? ''}
              />
              <div className="mt-1 text-xs text-black/50">Custom message at the bottom of receipts</div>
            </div>

            {/* Social Media */}
            <div>
              <label className="label" htmlFor="receipt-socialMediaHandle">Social Media Handle</label>
              <input id="receipt-socialMediaHandle"
                type="text"
                name="socialMediaHandle"
                className="input"
                placeholder="@yourstore"
                defaultValue={initialValues.socialMediaHandle ?? ''}
              />
              <div className="mt-1 text-xs text-black/50">Your social handle, shown below the footer.</div>
            </div>

          </fieldset>
          <fieldset disabled={!ready} className="min-w-0 space-y-4 border-t border-border pt-4">
            <legend className="px-1 font-semibold">Logo & visible details</legend>
            {/* Logo URL — override the canonical Business.logoUrl just for receipts */}
            <div>
              <label className="label" htmlFor="receipt-receiptLogoUrl">Receipt logo override</label>
              <input id="receipt-receiptLogoUrl"
                type="url"
                name="receiptLogoUrl"
                className="input"
                placeholder="https://example.com/logo.png"
                defaultValue={initialValues.receiptLogoUrl ?? ''}
              />
              <div className="mt-1 text-xs text-black/50">
                Optional. Leave blank to use the business logo from{' '}
                <Link href="/settings/organization" className="font-medium text-accent underline-offset-4 hover:underline">
                  Organization settings
                </Link>
                . Use this only if you want a different logo on printed receipts (e.g. a black-and-white version).
              </div>
            </div>

            {/* Keep a saved QR preference when its checkbox is unavailable. */}
            {(!storefrontEnabled || !storefrontUrl) && initialValues.receiptShowStorefrontQr && <input type="hidden" name="receiptShowStorefrontQr" value="on" />}
            {/* Toggle Options */}
            <div className="space-y-3 pt-2">
              <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border p-3">
                <input
                  type="checkbox"
                  name="receiptShowVatNumber"
                  className="h-4 w-4 rounded"
                  defaultChecked={initialValues.receiptShowVatNumber}
                />
                <span className="text-sm">Show VAT Number on receipts</span>
              </label>
              <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border p-3">
                <input
                  type="checkbox"
                  name="receiptShowAddress"
                  className="h-4 w-4 rounded"
                  defaultChecked={initialValues.receiptShowAddress}
                />
                <span className="text-sm">Show Business Address on receipts</span>
              </label>
              <label className="flex min-h-11 items-start gap-3 rounded-xl border border-border p-3">
                <input
                  type="checkbox"
                  name="receiptShowStorefrontQr"
                  className="mt-0.5 h-4 w-4 rounded"
                  defaultChecked={initialValues.receiptShowStorefrontQr}
                  disabled={!storefrontEnabled || !storefrontUrl}
                />
                <span className="text-sm">
                  <span className="block">Show online store QR on receipts</span>
                  <span className="block text-xs text-black/50">
                    {storefrontEnabled && storefrontUrl
                      ? 'Prints a small QR + store URL at the bottom of every receipt with text "Order online — scan to shop".'
                      : 'Enable the storefront in Settings → Online Storefront first.'}
                  </span>
                </span>
              </label>
            </div>

          </fieldset>
          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:flex-wrap sm:items-center">
            <p role="status" className="w-full text-sm text-muted">{dirty ? 'Unsaved receipt changes' : 'Your saved receipt design'}</p>
            <SubmitButton disabled={!ready} className="btn-primary min-h-11 w-full sm:w-auto" loadingText="Saving…">
              Save Receipt Design
            </SubmitButton>
            <button type="reset" className="btn-secondary min-h-11 w-full sm:w-auto" disabled={!ready || !dirty}>Discard changes</button>
          </div>
        </form>
      </div>

      {/* Preview */}
      <section id="receipt-preview" aria-labelledby="receipt-preview-heading" className="card min-w-0 scroll-mt-6 self-start p-4 sm:p-6 xl:sticky xl:top-6">
        <h2 id="receipt-preview-heading" className="text-lg font-display font-semibold">Live preview</h2>
        <p className="mt-1 text-sm text-muted">Try changes here before saving. This sample does not create a sale.</p>
        <div className="mt-4 rounded-xl border-2 border-dashed border-black/10 bg-white p-6">
          <div className="mx-auto max-w-64 break-words space-y-3 text-center text-sm">
            <MerchantBrandBadge branding={{ ...merchantBranding, receiptLogoUrl: draft.receiptLogoUrl || null }} surface="receipt" className="mx-auto" />

            {/* Business Name */}
            <div className="text-lg font-bold">{businessName}</div>

            {/* Address */}
            {draft.receiptShowAddress && draft.address && (
              <div className="whitespace-pre-line text-xs text-black/60">{draft.address}</div>
            )}

            {/* Phone */}
            {draft.phone && (
              <div className="text-xs text-black/60">{draft.phone}</div>
            )}

            {/* VAT Number */}
            {draft.receiptShowVatNumber && vatNumber && (
              <div className="text-xs text-black/60">VAT: {vatNumber}</div>
            )}

            {/* Header */}
            {draft.receiptHeader && (
              <div className="whitespace-pre-line border-t border-dashed border-black/10 pt-3 text-xs">
                {draft.receiptHeader}
              </div>
            )}

            {/* Items placeholder */}
            <div className="space-y-1 border-y border-dashed border-black/10 py-3">
              <div className="flex justify-between text-xs">
                <span>Sample Item</span>
                <span>{formatMoney(500, currency)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Another Item x2</span>
                <span>{formatMoney(1000, currency)}</span>
              </div>
              <div className="flex justify-between border-t border-black/10 pt-1 font-bold">
                <span>Total</span>
                <span>{formatMoney(1500, currency)}</span>
              </div>
            </div>

            {/* Footer */}
            {draft.receiptFooter && (
              <div className="whitespace-pre-line text-xs text-black/60">
                {draft.receiptFooter}
              </div>
            )}

            {/* Social */}
            {draft.socialMediaHandle && (
              <div className="text-xs text-black/40">
                Follow us: {draft.socialMediaHandle}
              </div>
            )}

            {/* Storefront QR */}
            {draft.receiptShowStorefrontQr && storefrontQrPreview && storefrontUrl ? (
              <div className="border-t border-dashed border-black/10 pt-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black/55">
                  Order online — scan to shop
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={storefrontQrPreview}
                  alt="Storefront QR"
                  className="mx-auto mt-2 h-20 w-20"
                />
                <div className="mt-1 break-all font-mono text-[10px] text-black/60">
                  {storefrontUrl.replace(/^https?:\/\//, '')}
                </div>
              </div>
            ) : null}

            {/* Timestamp */}
            <div className="pt-2 text-xs text-black/40">
              Sample receipt • not a sale
            </div>
          </div>
        </div>
        <div className="mt-4 text-center text-xs text-black/50">
          Preview changes instantly. Save to apply this design to future receipts.
        </div>
      </section>
    </div>

  );
}
