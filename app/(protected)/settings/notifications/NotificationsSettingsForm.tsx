'use client';

import { useEffect, useRef, useState } from 'react';
import FormError from '@/components/FormError';
import SubmitButton from '@/components/SubmitButton';
import { updateWhatsappSettingsAction } from '@/app/actions/notifications';
import SendTestSummaryButton from './SendTestSummaryButton';
import type { MerchantSummaryStatus } from '@/lib/notifications/merchant-summary-status';
import {
  isValidGhanaPhone,
  normaliseGhanaPhone,
} from '@/lib/phone/ghana-phone';
import {
  COMMON_AFRICAN_TIMEZONES,
  DEFAULT_BUSINESS_TIMEZONE,
} from '@/lib/notifications/utils';

function initialPhoneValue(stored?: string | null) {
  const value = stored?.trim() ?? '';
  if (!value) return '';
  return normaliseGhanaPhone(value) ?? value;
}

type NotificationsSettingsFormProps = {
  error?: string;
  business: {
    whatsappEnabled?: boolean | null;
    whatsappPhone?: string | null;
    whatsappScheduleTime?: string | null;
    whatsappBranchScope?: string | null;
    timezone?: string | null;
  };
  summaryStatus: MerchantSummaryStatus;
};

type PreviewState = {
  text: string;
  deepLink: string;
  error: string | null;
};

export default function NotificationsSettingsForm({
  error,
  business,
  summaryStatus,
}: NotificationsSettingsFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [summaryEnabled, setSummaryEnabled] = useState(!!business.whatsappEnabled);
  const [phoneValue, setPhoneValue] = useState(() => initialPhoneValue(business.whatsappPhone));
  const [phoneHint, setPhoneHint] = useState<string | null>(() => {
    const normalised = normaliseGhanaPhone(business.whatsappPhone);
    return normalised ? `This will be saved as ${normalised}.` : null;
  });
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewPending, setPreviewPending] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const handlePreview = () => {
    if (!formRef.current) return;

    const formData = new FormData(formRef.current);
    setPreview(null);
    setIsPreviewOpen(true);
    setPreviewPending(true);
    void (async () => {
      try {
        const response = await fetch('/api/notifications/preview', {
          method: 'POST',
          body: formData,
        });
        const data = (await response.json()) as { text?: string; deepLink?: string; error?: string };

        if (!response.ok) {
          setPreview({
            text: '',
            deepLink: '',
            error: data.error ?? 'Unable to generate preview right now.',
          });
          return;
        }

        setPreview({
          text: data.text ?? '',
          deepLink: data.deepLink ?? '',
          error: null,
        });
      } catch {
        setPreview({
          text: '',
          deepLink: '',
          error: 'Unable to generate preview right now.',
        });
      } finally {
        setPreviewPending(false);
      }
    })();
  };

  return (
    <>
      <div id="summary-preferences" className="card min-w-0 scroll-mt-6 p-4 sm:p-6">
        <h2 className="mb-1 text-base font-semibold">Daily Owner Summary</h2>
        <p className="mb-4 text-sm text-black/55">
          Send the business owner a simple end-of-day summary of sales, transactions, cash, MoMo, debtors, and key activity.
        </p>
        <FormError error={error} />
        <form ref={formRef} action={updateWhatsappSettingsAction} className="grid gap-4 md:grid-cols-2">
          <fieldset disabled={!ready} className="contents">
            <div className="md:col-span-2 rounded-2xl border border-black/5 bg-black/[0.02] px-4 py-4 text-sm text-black/60">
              Scheduled delivery uses SMS at your chosen send time. Preview the message any time, and open it in WhatsApp for manual follow-up when needed.
              {!summaryStatus.whatsappAutomationConnected ? (
                <span className="mt-2 block text-black/55">
                  Automated WhatsApp delivery is not fully connected yet. SMS scheduled delivery remains available.
                </span>
              ) : null}
            </div>
            <div className="md:col-span-2 flex items-center gap-3">
              <input
                className="h-4 w-4"
                type="checkbox"
                name="whatsappEnabled"
                id="whatsappEnabled"
                checked={summaryEnabled}
                onChange={(event) => setSummaryEnabled(event.target.checked)}
              />
              <label htmlFor="whatsappEnabled" className="text-sm font-medium">
                Enable Daily Owner Summary
              </label>
            </div>
            <div>
              <label className="label" htmlFor="summary-whatsappPhone">Owner phone number</label>
              <input id="summary-whatsappPhone"
                className="input"
                name="whatsappPhone"
                aria-invalid={!!phoneError} aria-describedby="summary-phone-help summary-phone-feedback" type="tel"
                placeholder="e.g. 0244123456"
                value={phoneValue}
                onChange={(event) => {
                  setPhoneValue(event.target.value);
                  if (phoneError) setPhoneError(null);
                }}
                onBlur={() => {
                  const trimmed = phoneValue.trim();
                  if (!trimmed) {
                    setPhoneHint(null);
                    setPhoneError(null);
                    return;
                  }

                  if (!isValidGhanaPhone(trimmed)) {
                    setPhoneError('Please enter a valid Ghana phone number.');
                    setPhoneHint(null);
                    return;
                  }

                  const normalised = normaliseGhanaPhone(trimmed)!;
                  setPhoneValue(normalised);
                  setPhoneHint(`This will be saved as ${normalised}.`);
                  setPhoneError(null);
                }}
              />
              <p id="summary-phone-help" className="mt-1 text-xs text-black/40">
                Enter the owner&apos;s Ghana phone number. You can use 0244123456 or 233244123456.
              </p>
              {phoneHint ? <p id="summary-phone-feedback" className="mt-1 text-xs text-black/45">{phoneHint}</p> : null}
              {phoneError ? <p id="summary-phone-feedback" role="alert" className="mt-1 text-xs text-rose-600">{phoneError}</p> : null}
            </div>
            <div>
              <label className="label" htmlFor="summary-whatsappScheduleTime">Send time</label>
              <input id="summary-whatsappScheduleTime"
                className="input"
                name="whatsappScheduleTime"
                type="time"
                defaultValue={business.whatsappScheduleTime ?? '20:00'}
              />
              <p className="mt-1 text-xs text-black/40">
                SMS scheduled delivery uses this time in your business timezone.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="summary-timezone">Timezone</label>
              <select id="summary-timezone"
                className="input"
                name="timezone"
                defaultValue={business.timezone ?? DEFAULT_BUSINESS_TIMEZONE}
              >
                {business.timezone && !COMMON_AFRICAN_TIMEZONES.some(option => option.value === business.timezone) && <option value={business.timezone}>{business.timezone}</option>}
                {COMMON_AFRICAN_TIMEZONES.map((timezone) => (
                  <option key={timezone.value} value={timezone.value}>
                    {timezone.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="summary-whatsappBranchScope">Branch scope</label>
              <select id="summary-whatsappBranchScope"
                className="input"
                name="whatsappBranchScope"
                defaultValue={business.whatsappBranchScope ?? 'ALL'}
              >
                <option value="ALL">All branches</option>
                <option value="MAIN">Main branch only</option>
              </select>
            </div>
            <div className="md:col-span-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <SubmitButton className="btn-primary min-h-11 w-full sm:w-auto" loadingText="Saving…" disabled={!!phoneError}>Save Settings</SubmitButton>
              <button
                type="button"
                className="btn-secondary text-center sm:min-w-[11rem]"
                onClick={handlePreview}
                disabled={previewPending}
              >
                {previewPending ? 'Generating Preview...' : 'Preview Message'}
              </button>

            </div>
            <details className="md:col-span-2 rounded-xl border border-border p-4">
              <summary className="min-h-11 cursor-pointer text-sm font-semibold">Send a test summary</summary>
              <p className="mb-3 text-sm text-muted">This uses your saved settings and may send a real message to the owner. Save changes first.</p>
              <SendTestSummaryButton whatsappAutomationConnected={summaryStatus.whatsappAutomationConnected} />
            </details>
            <div className="md:col-span-2 text-xs text-black/45">
              Preview uses the current form values and does not require saving first.
            </div>
          </fieldset>
        </form>
      </div>

      {(previewPending || (isPreviewOpen && preview)) && (
        <div className="card min-w-0 p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Message preview</h2>
              <p className="mt-1 text-sm text-black/55">
                Preview the daily summary message before it is sent.
              </p>
            </div>
            {!previewPending ? (
              <button
                type="button"
                className="text-xs font-medium text-black/55 underline-offset-2 hover:text-black hover:underline"
                onClick={() => {
                  setPreview(null);
                  setIsPreviewOpen(false);
                }}
              >
                Close preview
              </button>
            ) : null}
          </div>
          {previewPending ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-black/70">
              Generating preview...
            </div>
          ) : preview?.error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {preview.error}
            </div>
          ) : (
            <>
              <pre className="whitespace-pre-wrap break-words rounded-xl border border-emerald-200 bg-emerald-50 p-4 font-mono text-sm text-black/80">
                {preview?.text}
              </pre>
              {preview?.deepLink ? (
                <>
                  <p className="mt-4 text-sm text-black/55">
                    Preview the message and open it in WhatsApp if you want to send it manually.
                  </p>
                  <a
                    href={preview.deepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary mt-3 inline-flex items-center gap-2"
                  >
                    Open in WhatsApp
                  </a>
                </>
              ) : null}
            </>
          )}
        </div>
      )}
    </>
  );
}
