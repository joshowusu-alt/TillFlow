'use client';

import { useRef, useState, useTransition } from 'react';
import FormError from '@/components/FormError';
import SubmitButton from '@/components/SubmitButton';
import { updateWhatsappSettingsAction } from '@/app/actions/notifications';

type NotificationsSettingsFormProps = {
  error?: string;
  business: {
    whatsappEnabled?: boolean | null;
    whatsappPhone?: string | null;
    whatsappScheduleTime?: string | null;
    whatsappBranchScope?: string | null;
  };
};

type PreviewState = {
  text: string;
  deepLink: string;
  error: string | null;
};

export default function NotificationsSettingsForm({
  error,
  business
}: NotificationsSettingsFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewPending, startPreview] = useTransition();

  const handlePreview = () => {
    if (!formRef.current) return;

    const formData = new FormData(formRef.current);
    setPreview(null);
    setIsPreviewOpen(true);
    startPreview(async () => {
      try {
        const response = await fetch('/api/notifications/preview', {
          method: 'POST',
          body: formData
        });
        const data = (await response.json()) as { text?: string; deepLink?: string; error?: string };

        if (!response.ok) {
          setPreview({
            text: '',
            deepLink: '',
            error: data.error ?? 'Unable to generate preview right now.'
          });
          return;
        }

        setPreview({
          text: data.text ?? '',
          deepLink: data.deepLink ?? '',
          error: null
        });
      } catch {
        setPreview({
          text: '',
          deepLink: '',
          error: 'Unable to generate preview right now.'
        });
      }
    });
  };

  return (
    <>
      <div className="card p-4 sm:p-6">
        <h2 className="mb-4 text-base font-semibold">WhatsApp Daily Summary</h2>
        <FormError error={error} />
        <form ref={formRef} action={updateWhatsappSettingsAction} className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2 rounded-2xl border border-black/5 bg-black/[0.02] px-4 py-4 text-sm text-black/60">
            Configure the owner&apos;s end-of-day WhatsApp summary, schedule window, and message preview in one place.
          </div>
          <div className="md:col-span-2 flex items-center gap-3">
            <input
              className="h-4 w-4"
              type="checkbox"
              name="whatsappEnabled"
              id="whatsappEnabled"
              defaultChecked={!!business.whatsappEnabled}
            />
            <label htmlFor="whatsappEnabled" className="text-sm font-medium">
              Enable WhatsApp EOD summary
            </label>
          </div>
          <div>
            <label className="label">Owner WhatsApp Phone</label>
            <input
              className="input"
              name="whatsappPhone"
              type="tel"
              placeholder="e.g. 233241234567"
              defaultValue={business.whatsappPhone ?? ''}
            />
            <p className="mt-1 text-xs text-black/40">
              Include country code, no + symbol. e.g. 233241234567 for Ghana.
            </p>
          </div>
          <div>
            <label className="label">Send Time (24h local)</label>
            <input
              className="input"
              name="whatsappScheduleTime"
              type="time"
              defaultValue={business.whatsappScheduleTime ?? '20:00'}
            />
          </div>
          <div>
            <label className="label">Branch Scope</label>
            <select
              className="input"
              name="whatsappBranchScope"
              defaultValue={business.whatsappBranchScope ?? 'ALL'}
            >
              <option value="ALL">All branches</option>
              <option value="MAIN">Main branch only</option>
            </select>
          </div>
          <div className="md:col-span-2 flex flex-col gap-3 sm:flex-row">
            <SubmitButton>Save Settings</SubmitButton>
            <button
              type="button"
              className="btn-secondary text-center sm:min-w-[11rem]"
              onClick={handlePreview}
              disabled={previewPending}
            >
              {previewPending ? 'Generating Preview...' : 'Preview Message'}
            </button>
          </div>
          <div className="md:col-span-2 text-xs text-black/45">
            Preview uses the current form values and does not require saving first.
          </div>
        </form>
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>How it works:</strong> Set up a Vercel Cron job or call{' '}
          <code className="rounded bg-amber-100 px-1 font-mono text-xs">/api/cron/eod-summary</code>{' '}
          with your <code className="rounded bg-amber-100 px-1 font-mono text-xs">CRON_SECRET</code>{' '}
          at the scheduled time. The system generates the message and provides a WhatsApp deep
          link for quick sending.
        </div>
      </div>

      {(previewPending || (isPreviewOpen && preview)) && (
        <div className="card p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Message Preview</h2>
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
              <pre className="whitespace-pre-wrap rounded-xl border border-emerald-200 bg-emerald-50 p-4 font-mono text-sm text-black/80">
                {preview?.text}
              </pre>
              {preview?.deepLink ? (
                <a
                  href={preview.deepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary mt-4 inline-flex items-center gap-2"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  Open in WhatsApp
                </a>
              ) : null}
            </>
          )}
        </div>
      )}
    </>
  );
}
