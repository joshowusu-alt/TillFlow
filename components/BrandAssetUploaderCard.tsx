'use client';

import type { ChangeEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { getContrastForeground, resolvePrimaryBrandColor } from '@/lib/storefront-branding';

const MAX_LOGO_SIZE = 2 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type AssetKey = 'PRIMARY' | 'COMPACT' | 'SQUARE';

type Props = {
  assetKey: AssetKey;
  title: string;
  description: string;
  recommendation: string;
  currentUrl: string | null;
  businessName: string;
  fallbackInitials: string;
  fallbackColor?: string | null;
  previewTone?: 'wide' | 'square';
  onChange: (nextUrl: string | null) => void;
  onPendingChange?: (nextUrl: string | null) => void;
};

function joinClasses(...values: Array<string | undefined | false | null>) {
  return values.filter(Boolean).join(' ');
}

export default function BrandAssetUploaderCard({
  assetKey,
  title,
  description,
  recommendation,
  currentUrl,
  businessName,
  fallbackInitials,
  fallbackColor,
  previewTone = 'wide',
  onChange,
  onPendingChange,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<'idle' | 'uploading' | 'removing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [failedPreviewUrl, setFailedPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (pendingPreviewUrl) {
        URL.revokeObjectURL(pendingPreviewUrl);
      }
    };
  }, [pendingPreviewUrl]);

  function clearPending() {
    if (pendingPreviewUrl) {
      URL.revokeObjectURL(pendingPreviewUrl);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setPendingFile(null);
    setPendingPreviewUrl(null);
    onPendingChange?.(null);
  }

  function handleSelectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Only JPEG, PNG and WebP logos are allowed.');
      return;
    }
    if (file.size > MAX_LOGO_SIZE) {
      setError('Logo must not exceed 2 MB.');
      return;
    }

    if (pendingPreviewUrl) {
      URL.revokeObjectURL(pendingPreviewUrl);
    }

    setError(null);
    setPendingFile(file);
    setConfirmingRemove(false);

    const nextPreviewUrl = URL.createObjectURL(file);
    setPendingPreviewUrl(nextPreviewUrl);
    onPendingChange?.(nextPreviewUrl);
  }

  async function confirmUpload() {
    if (!pendingFile || busy !== 'idle') return;
    setBusy('uploading');
    setError(null);

    try {
      const formData = new FormData();
      formData.set('assetKey', assetKey);
      formData.set('logoFile', pendingFile);
      const response = await fetch('/api/settings/brand-assets', {
        method: 'POST',
        body: formData,
        credentials: 'same-origin',
      });
      const payload = (await response.json().catch(() => null)) as
        | { logoUrl?: string; error?: string }
        | null;
      if (!response.ok || !payload?.logoUrl) {
        throw new Error(payload?.error || 'Could not upload this logo right now.');
      }

      onChange(payload.logoUrl);
      clearPending();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Could not upload this logo right now.');
    } finally {
      setBusy('idle');
    }
  }

  async function removeAsset() {
    if (busy !== 'idle' || !confirmingRemove) {
      return;
    }

    setBusy('removing');
    setError(null);
    try {
      const response = await fetch(`/api/settings/brand-assets?assetKey=${assetKey}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Could not remove this logo right now.');
      }

      clearPending();
      onChange(null);
      setConfirmingRemove(false);
      setFailedPreviewUrl(null);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Could not remove this logo right now.');
    } finally {
      setBusy('idle');
    }
  }

  const displayUrl = pendingPreviewUrl ?? currentUrl;
  const previewClasses =
    previewTone === 'square'
      ? 'h-20 w-20 rounded-2xl'
      : 'h-20 w-28 rounded-2xl sm:w-32';
  const hasPendingPreview = Boolean(pendingFile && pendingPreviewUrl);
  const previewImgFailed = Boolean(displayUrl && failedPreviewUrl === displayUrl);
  const hasSavedAssetFailure = Boolean(currentUrl && !pendingPreviewUrl && previewImgFailed);
  const tileColor = resolvePrimaryBrandColor(fallbackColor);
  const tileForeground = getContrastForeground(tileColor);
  const assetStateLabel = hasPendingPreview
    ? 'Pending preview'
    : displayUrl && !previewImgFailed
      ? 'Saved asset'
      : hasSavedAssetFailure
        ? 'Using smart fallback'
        : 'Using smart fallback';

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.45)] sm:p-5">
      <div className="flex items-start gap-3 sm:gap-4">
        <div
          className={joinClasses(
            'relative flex shrink-0 items-center justify-center overflow-hidden border border-black/10 bg-white p-2 transition',
            previewClasses,
          )}
        >
          {displayUrl && !previewImgFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayUrl}
              alt={`${businessName} ${title.toLowerCase()}`}
              className="h-full w-full object-contain"
              onError={() => setFailedPreviewUrl(displayUrl)}
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center rounded-[18px] text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
              style={{ backgroundColor: tileColor, color: tileForeground }}
            >
              <div>
                <div className="text-lg font-semibold tracking-[0.16em]">{fallbackInitials}</div>
                <div className="mt-1 text-[9px] font-medium uppercase tracking-[0.18em] opacity-80">
                  {previewTone === 'square' ? 'Compact' : 'Hero'}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-[11px] uppercase tracking-[0.22em] text-black/45">{title}</div>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600">
              {assetStateLabel}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-ink">{description}</p>
          <p className="mt-1 text-[11px] leading-5 text-black/55">{recommendation}</p>
          {hasPendingPreview ? (
            <p className="mt-2 text-[11px] leading-5 text-black/55">
              Selected <span className="font-semibold text-ink">{pendingFile?.name}</span>. Confirm when this
              preview looks right.
            </p>
          ) : null}

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy !== 'idle'}
              className="btn-primary w-full text-xs disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {busy === 'uploading'
                ? 'Uploading…'
                : hasPendingPreview
                  ? 'Choose different file'
                  : currentUrl
                    ? 'Replace asset'
                    : 'Upload asset'}
            </button>

            {hasPendingPreview ? (
              <>
                <button
                  type="button"
                  onClick={confirmUpload}
                  disabled={busy !== 'idle'}
                  className="btn-secondary w-full text-xs disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  Confirm preview
                </button>
                <button
                  type="button"
                  onClick={() => {
                      clearPending();
                      setError(null);
                      setFailedPreviewUrl(null);
                  }}
                  disabled={busy !== 'idle'}
                  className="text-xs font-semibold text-black/55 transition hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
              </>
            ) : currentUrl ? (
              confirmingRemove ? (
                <>
                  <button
                    type="button"
                    onClick={removeAsset}
                    disabled={busy !== 'idle'}
                    className="text-xs font-semibold text-rose-600 transition hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busy === 'removing' ? 'Removing…' : 'Confirm remove'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingRemove(false)}
                    disabled={busy !== 'idle'}
                    className="text-xs font-semibold text-black/55 transition hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Keep asset
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingRemove(true)}
                  disabled={busy !== 'idle'}
                  className="text-xs font-semibold text-rose-600 transition hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Remove
                </button>
              )
            ) : null}
            {hasSavedAssetFailure ? (
              <button
                type="button"
                onClick={() => setFailedPreviewUrl(null)}
                disabled={busy !== 'idle'}
                className="text-xs font-semibold text-black/55 transition hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
              >
                Try again
              </button>
            ) : null}
          </div>

          {hasSavedAssetFailure ? (
            <div className="mt-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-[11px] leading-5 text-amber-900">
              <div className="font-semibold">Saved logo couldn&apos;t load.</div>
              <div> TillFlow is showing your premium initials tile until you try again or replace it. </div>
            </div>
          ) : null}
          {error ? (
            <p className="mt-3 text-[11px] font-medium text-rose-700" role="alert">
              {error}
            </p>
          ) : null}
          {confirmingRemove && busy === 'idle' ? (
            <p className="mt-2 text-[11px] text-black/50">Remove this saved asset from TillFlow?</p>
          ) : null}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        className="hidden"
        onChange={handleSelectFile}
      />
    </div>
  );
}
