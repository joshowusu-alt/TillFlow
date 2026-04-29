'use client';

import { useState } from 'react';
import type { StorefrontPaymentMode } from '@/lib/storefront-payments';

type Props = {
  defaultMode: StorefrontPaymentMode;
  defaultMomoNumber: string;
  defaultMomoNetwork: string;
  defaultMerchantShortcode: string;
  defaultBankName: string;
  defaultBankAccountName: string;
  defaultBankAccountNumber: string;
  defaultBankBranch: string;
  defaultPaymentNote: string;
};

const MODE_OPTIONS: ReadonlyArray<{ value: StorefrontPaymentMode; label: string; description: string }> = [
  {
    value: 'MOMO_NUMBER',
    label: 'Mobile money number',
    description: 'Customers send to a regular MoMo phone number (e.g. 0245 199 033).',
  },
  {
    value: 'MERCHANT_SHORTCODE',
    label: 'Merchant shortcode',
    description: 'Customers pay via the "Pay merchant" flow using your short merchant ID.',
  },
  {
    value: 'BANK_TRANSFER',
    label: 'Bank transfer',
    description: 'Customers transfer to your bank account and use the order reference.',
  },
  {
    value: 'MANUAL_CONFIRMATION',
    label: 'Contact me to arrange',
    description: 'Customers place the order; you reach out with payment instructions.',
  },
];

export default function StorefrontPaymentModeCard(props: Props) {
  const [mode, setMode] = useState<StorefrontPaymentMode>(props.defaultMode);

  return (
    <div className="lg:col-span-2 rounded-2xl border border-black/5 bg-black/[0.03] px-4 py-4">
      <div className="text-sm font-semibold text-ink">Ordering &amp; payment</div>
      <p className="mt-1 text-xs text-black/55">
        Choose how customers pay for online orders. Their payment instructions update automatically.
      </p>

      <div className="mt-3">
        <label className="label">Payment collection method</label>
        <select
          className="input"
          name="storefrontPaymentMode"
          value={mode}
          onChange={(event) => setMode(event.target.value as StorefrontPaymentMode)}
        >
          {MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="mt-1 text-xs text-black/55">
          {MODE_OPTIONS.find((option) => option.value === mode)?.description}
        </div>
      </div>

      {mode === 'MOMO_NUMBER' ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px]">
          <div>
            <label className="label">MoMo number</label>
            <input
              className="input"
              name="storefrontMomoNumber"
              defaultValue={props.defaultMomoNumber}
              placeholder="e.g. 024 123 4567"
            />
          </div>
          <div>
            <label className="label">Network</label>
            <select className="input" name="storefrontMomoNetwork" defaultValue={props.defaultMomoNetwork}>
              <option value="">Not set</option>
              <option value="MTN">MTN</option>
              <option value="TELECEL">Telecel</option>
              <option value="AIRTELTIGO">AirtelTigo</option>
            </select>
          </div>
        </div>
      ) : null}

      {mode === 'MERCHANT_SHORTCODE' ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px]">
          <div>
            <label className="label">Merchant number / shortcode</label>
            <input
              className="input"
              name="storefrontMerchantShortcode"
              defaultValue={props.defaultMerchantShortcode}
              placeholder="e.g. 306506"
            />
          </div>
          <div>
            <label className="label">Network</label>
            <select className="input" name="storefrontMomoNetwork" defaultValue={props.defaultMomoNetwork}>
              <option value="">Not set</option>
              <option value="MTN">MTN</option>
              <option value="TELECEL">Telecel</option>
              <option value="AIRTELTIGO">AirtelTigo</option>
            </select>
          </div>
        </div>
      ) : null}

      {mode === 'BANK_TRANSFER' ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-1">
            <label className="label">Bank name</label>
            <input
              className="input"
              name="storefrontBankName"
              defaultValue={props.defaultBankName}
              placeholder="e.g. GCB Bank"
            />
          </div>
          <div className="sm:col-span-1">
            <label className="label">Account name</label>
            <input
              className="input"
              name="storefrontBankAccountName"
              defaultValue={props.defaultBankAccountName}
              placeholder="Business account holder name"
            />
          </div>
          <div className="sm:col-span-1">
            <label className="label">Account number</label>
            <input
              className="input"
              name="storefrontBankAccountNumber"
              defaultValue={props.defaultBankAccountNumber}
              placeholder="Account number"
            />
          </div>
          <div className="sm:col-span-1">
            <label className="label">Branch (optional)</label>
            <input
              className="input"
              name="storefrontBankBranch"
              defaultValue={props.defaultBankBranch}
              placeholder="e.g. Accra Main"
            />
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        <label className="label">Customer message (optional)</label>
        <textarea
          className="input min-h-20"
          name="storefrontPaymentNote"
          defaultValue={props.defaultPaymentNote}
          placeholder="Anything else the customer should know about payment, e.g. opening hours for confirmation."
        />
        <div className="mt-1 text-xs text-black/55">
          Shown on the order confirmation page below the payment instructions.
        </div>
      </div>

      {/*
        Hidden fields preserve the stored values for any field NOT visible in
        the current mode. Each name appears at most once across visible +
        hidden inputs so the form action receives a single value per field.
      */}
      {mode !== 'MOMO_NUMBER' ? (
        <input type="hidden" name="storefrontMomoNumber" value={props.defaultMomoNumber} />
      ) : null}
      {mode !== 'MERCHANT_SHORTCODE' ? (
        <input type="hidden" name="storefrontMerchantShortcode" value={props.defaultMerchantShortcode} />
      ) : null}
      {mode !== 'MOMO_NUMBER' && mode !== 'MERCHANT_SHORTCODE' ? (
        <input type="hidden" name="storefrontMomoNetwork" value={props.defaultMomoNetwork} />
      ) : null}
      {mode !== 'BANK_TRANSFER' ? (
        <>
          <input type="hidden" name="storefrontBankName" value={props.defaultBankName} />
          <input type="hidden" name="storefrontBankAccountName" value={props.defaultBankAccountName} />
          <input type="hidden" name="storefrontBankAccountNumber" value={props.defaultBankAccountNumber} />
          <input type="hidden" name="storefrontBankBranch" value={props.defaultBankBranch} />
        </>
      ) : null}
    </div>
  );
}
