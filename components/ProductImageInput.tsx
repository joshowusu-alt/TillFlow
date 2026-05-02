'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';

type PreviewState = 'idle' | 'loading' | 'ok' | 'error';

type Props = {
  defaultUrl?: string | null;
};

export default function ProductImageInput({ defaultUrl }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState(defaultUrl ?? '');
  const [urlValue, setUrlValue] = useState(defaultUrl ?? '');
  const [filePreviewUrl, setFilePreviewUrl] = useState('');
  const [removeImage, setRemoveImage] = useState(false);
  const [previewState, setPreviewState] = useState<PreviewState>(defaultUrl ? 'loading' : 'idle');

  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, [filePreviewUrl]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);

    if (!file) {
      setFilePreviewUrl('');
      setPreviewUrl(urlValue);
      setPreviewState(urlValue ? 'loading' : 'idle');
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    setFilePreviewUrl(nextUrl);
    setPreviewUrl(nextUrl);
    setRemoveImage(false);
    setPreviewState('loading');
  }

  function handleUrlChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setFilePreviewUrl('');
    setUrlValue(next);
    setRemoveImage(false);
    setPreviewState(next ? 'loading' : 'idle');
    setPreviewUrl(next);
  }

  function handleRemove() {
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setFilePreviewUrl('');
    setRemoveImage(true);
    setUrlValue('');
    setPreviewUrl('');
    setPreviewState('idle');
  }

  const urlLooksLikePage = urlValue && !filePreviewUrl && !/\.(jpe?g|png|webp|gif|avif|svg)(\?.*)?$/i.test(urlValue);

  return (
    <div className="space-y-3">
      <input type="hidden" name="removeImage" value={removeImage ? '1' : '0'} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {/* Preview box */}
        <div className="relative flex h-28 w-full flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-black/10 bg-slate-50 text-xs text-black/45 sm:w-32">
          {previewUrl && (
            // key forces img to remount (resets load state) when URL changes
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={previewUrl}
              src={previewUrl}
              alt="Product preview"
              className={`h-full w-full object-cover transition-opacity duration-200 ${previewState === 'ok' ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}
              onLoad={() => setPreviewState('ok')}
              onError={() => setPreviewState('error')}
            />
          )}
          {(!previewUrl || previewState === 'idle') && (
            <span>No image</span>
          )}
          {previewUrl && previewState === 'loading' && (
            <span className="text-[11px] text-black/35">Loading…</span>
          )}
          {previewState === 'error' && (
            <div className="flex flex-col items-center gap-1 px-2 text-center">
              <svg className="h-6 w-6 text-black/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
              </svg>
              <span className="text-[10px] leading-tight">Can&apos;t load</span>
            </div>
          )}
        </div>

        <div className="grid flex-1 gap-3">
          <div>
            <label className="label">Upload image</label>
            <input
              ref={fileInputRef}
              className="input"
              name="imageFile"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
            />
          </div>
          <div>
            <label className="label">Or image URL</label>
            <input
              className="input"
              name="imageUrl"
              type="url"
              value={urlValue}
              onChange={handleUrlChange}
              placeholder="https://example.com/product.jpg"
            />
            {previewState === 'error' && urlLooksLikePage && (
              <p className="mt-1 text-xs text-amber-700">
                This looks like a webpage link, not a direct image. Right-click the image on the website and choose &ldquo;Copy image address&rdquo;, then paste that URL here.
              </p>
            )}
            {previewState === 'error' && !urlLooksLikePage && urlValue && (
              <p className="mt-1 text-xs text-rose-600">
                Image could not be loaded. The server may block direct linking. Try uploading the image file instead.
              </p>
            )}
          </div>
          {(defaultUrl || previewUrl || urlValue) ? (
            <button
              type="button"
              className="w-fit text-xs font-semibold text-rose-600 hover:text-rose-700"
              onClick={handleRemove}
            >
              Remove image
            </button>
          ) : null}
        </div>
      </div>

      <div className="text-xs text-black/50">
        Uploading a file is the most reliable option. If using a URL, it must be a direct image link ending in .jpg, .png, or .webp — not a product page.
      </div>
    </div>
  );
}
