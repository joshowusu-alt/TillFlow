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

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className={joinClasses('flex shrink-0 items-center justify-center overflow-hidden border border-black/10 bg-white p-2', previewClasses)}>
          {displayUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={displayUrl} alt={`${businessName} ${title.toLowerCase()}`} className="h-full w-full object-contain" />
          ) : (
            <span className="px-2 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-black/35">
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
