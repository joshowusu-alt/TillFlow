'use client';

import { useState } from 'react';
import SettingsSection from '@/components/SettingsSection';

type Props = {
  enabled: boolean;
  senderId: string | null;
  provider: 'Hubtel' | 'Arkesel' | null;
};

export default function StorefrontSmsSettings({ enabled, senderId, provider }: Props) {
  const [smsEnabled, setSmsEnabled] = useState(enabled);
  return (
    <SettingsSection
      title="SMS notifications"
      badge={smsEnabled ? 'SMS On' : 'SMS Off'}
      description="Send customers automatic SMS updates when their order status changes."
      eyebrow="Messaging"
      keepMounted
    >
      <div className="space-y-4">
        <p className={`rounded-xl border px-4 py-3 text-sm ${provider
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          {provider ? `SMS provider connected via ${provider}.` : 'SMS provider is not connected. Contact TillFlow support to set up delivery.'}
        </p>
        <p className="text-sm text-slate-600">Customers receive updates for orders placed, payment confirmed, ready for pickup and cancellation. Standard SMS rates apply.</p>
        {provider ? <input type="hidden" name="smsSettingsIncluded" value="1" /> : null}
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            name="smsNotificationsEnabled"
            checked={smsEnabled}
            onChange={(event) => setSmsEnabled(event.target.checked)}
            className="h-5 w-5"
            disabled={!provider}
          />
          <span className="text-sm font-medium text-slate-800">Enable SMS order notifications</span>
        </label>
        <p className="text-sm text-slate-600">Changes apply after you save storefront settings.</p>
        <div>
          <label htmlFor="storefront-sms-sender" className="label">Custom sender ID <span className="font-normal text-slate-600">(optional)</span></label>
          <input id="storefront-sms-sender" className="input max-w-xs" name="smsSenderId" defaultValue={senderId ?? ''} placeholder="TillFlow" maxLength={11} />
          <p className="mt-1 text-xs text-slate-600">Leave blank to use TillFlow. Custom sender IDs (max 11 characters) must be approved by your SMS provider.</p>
        </div>
      </div>
    </SettingsSection>
  );
}
