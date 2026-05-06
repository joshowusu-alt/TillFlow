'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2 MB — matches saveBusinessLogoFile
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ACCEPT_ATTR = ACCEPTED_TYPES.join(',');

type Props = {
  initialLogoUrl: string | null;
  businessName: string;
};

function initialsFromName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('') || 'B';
}

export default function BusinessLogoUploader({ initialLogoUrl, businessName }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [busy, setBusy] = useState<'idle' | 'uploading' | 'removing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const initials = initialsFromName(businessName);

  function pickFile() {
    setError(null);
    fileInputRef.current?.click();
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
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

    setBusy('uploading');
    setError(null);
    try {
      const formData = new FormData();
      formData.set('logoFile', file);
      const response = await fetch('/api/settings/business-logo', {
        method: 'POST',
        body: formData,
        credentials: 'same-origin',
      });
      const payload = (await response.json().catch(() => null)) as
        | { logoUrl?: string; error?: string }
        | null;
      if (!response.ok || !payload?.logoUrl) {
        throw new Error(payload?.error || 'Could not upload the logo right now.');
      }
      setLogoUrl(payload.logoUrl);
      router.refresh();
    } catch (uploadError) {
      const message =
        uploadError instanceof Error
          ? uploadError.message
          : 'Could not upload the logo right now.';
      setError(message);
    } finally {
      setBusy('idle');
    }
  }

  async function handleRemove() {
    if (busy !== 'idle') return;
    if (!confirm('Remove your business logo? Your storefront and receipts will fall back to the default.')) {
      return;
    }
    setBusy('removing');
    setError(null);
    try {
      const response = await fetch('/api/settings/business-logo', {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Could not remove the logo right now.');
      }
      setLogoUrl(null);
      router.refresh();
    } catch (removeError) {
      const message =
        removeError instanceof Error
          ? removeError.message
          : 'Could not remove the logo right now.';
      setError(message);
    } finally {
      setBusy('idle');
    }
  }

  const uploading = busy === 'uploading';
  const removing = busy === 'removing';

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-black/10 bg-slate-50">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={`${businessName} logo`} className="h-full w-full object-contain" />
          ) : (
            <span className="text-2xl font-black tracking-[0.12em] text-black/30">{initials}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-[0.2em] text-black/50">Business logo</div>
          <h3 className="mt-1 text-base font-display font-semibold text-ink">
            {logoUrl ? 'Your logo is live' : 'Add your logo'}
          </h3>
          <p className="mt-1 text-sm text-black/55">
            Shown on your online storefront, receipts, and the admin header. Square images work
            best at 256×256 px or larger. JPEG, PNG, or WebP up to 2 MB.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={pickFile}
              disabled={uploading || removing}
              className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploading ? 'Uploading…' : logoUrl ? 'Replace logo' : 'Upload logo'}
            </button>
            {logoUrl ? (
              <button
                type="button"
                onClick={handleRemove}
                disabled={uploading || removing}
                className="btn-secondary text-xs disabled:cursor-not-allowed disabled:opacity-60"
              >
                {removing ? 'Removing…' : 'Remove'}
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
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
