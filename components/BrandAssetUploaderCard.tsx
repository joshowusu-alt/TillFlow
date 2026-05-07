'use client';

import type { ChangeEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

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
  previewTone?: 'wide' | 'square';
  onChange: (nextUrl: string | null) => void;
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
  previewTone = 'wide',
  onChange,
}: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<'idle' | 'uploading' | 'removing'>('idle');
  const [error, setError] = useState<string | null>(null);

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
    setPendingPreviewUrl(URL.createObjectURL(file));
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
      router.refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Could not upload this logo right now.');
    } finally {
      setBusy('idle');
    }
  }

  async function removeAsset() {
    if (busy !== 'idle') return;
    if (!confirm(`Remove the ${title.toLowerCase()}?`)) {
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
      router.refresh();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Could not remove this logo right now.');
    } finally {
      setBusy('idle');
    }
  }

  const displayUrl = pendingPreviewUrl ?? currentUrl;
  const previewClasses =
    previewTone === 'square'
      ? 'h-24 w-24 rounded-2xl'
      : 'h-24 w-36 rounded-2xl sm:w-40';
  const hasPendingPreview = Boolean(pendingFile && pendingPreviewUrl);
  const [previewImgFailed, setPreviewImgFailed] = useState(false);

  // Reset img-failed flag when the displayed URL changes
  useEffect(() => {
    setPreviewImgFailed(false);
  }, [displayUrl]);

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className={joinClasses('flex shrink-0 items-center justify-center overflow-hidden border border-black/10 bg-white p-2 transition', previewClasses)}>
          {displayUrl && !previewImgFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayUrl}
              alt={`${businessName} ${title.toLowerCase()}`}
              className="h-full w-full object-contain"
              onError={() => {
                if (process.env.NODE_ENV !== 'production') {
                  // eslint-disable-next-line no-console
                  console.warn('[brand-asset] preview failed to load:', displayUrl);
                }
                setPreviewImgFailed(true);
              }}
            />
          ) : previewImgFailed ? (
            <div className="flex flex-col items-center gap-1.5 px-2 text-center">
              <svg className="h-4 w-4 text-rose-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-rose-500">Load error</span>
            </div>
          ) : (
            <span className="px-2 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-black/25">
              {title}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-[0.2em] text-black/45">{title}</div>
          <p className="mt-1 text-sm text-black/60">{description}</p>
          <p className="mt-2 text-xs font-medium text-accent">{recommendation}</p>
          {hasPendingPreview ? (
            <p className="mt-2 text-xs text-black/55">
              Selected: <span className="font-semibold text-ink">{pendingFile?.name}</span>. TillFlow will not
              use this asset until you confirm it.
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy !== 'idle'}
              className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-60"
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
                  className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Confirm asset
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearPending();
                    setError(null);
                  }}
                  disabled={busy !== 'idle'}
                  className="text-xs font-semibold text-black/55 transition hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
              </>
            ) : currentUrl ? (
              <button
                type="button"
                onClick={removeAsset}
                disabled={busy !== 'idle'}
                className="text-xs font-semibold text-rose-600 transition hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy === 'removing' ? 'Removing…' : 'Remove'}
              </button>
            ) : null}
          </div>

          {previewImgFailed && currentUrl && !pendingPreviewUrl ? (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">
              <div className="font-semibold">Saved logo couldn&apos;t load.</div>
              <div className="mt-1 break-all text-[11px] text-rose-700/80">
                <span className="font-mono">{currentUrl}</span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewImgFailed(false)}
                className="mt-2 inline-flex items-center text-[11px] font-semibold text-rose-700 underline-offset-2 hover:underline"
              >
                Try again
              </button>
            </div>
          ) : null}
          {error ? (
            <p className="mt-3 text-xs font-medium text-rose-700" role="alert">
              {error}
            </p>
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
