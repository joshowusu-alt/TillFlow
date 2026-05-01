'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';

type Props = {
  defaultUrl?: string | null;
};

export default function ProductImageInput({ defaultUrl }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState(defaultUrl ?? '');
  const [urlValue, setUrlValue] = useState(defaultUrl ?? '');
  const [filePreviewUrl, setFilePreviewUrl] = useState('');
  const [removeImage, setRemoveImage] = useState(false);
  const [previewError, setPreviewError] = useState(false);

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
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    setFilePreviewUrl(nextUrl);
    setPreviewUrl(nextUrl);
    setRemoveImage(false);
    setPreviewError(false);
  }

  function handleUrlChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setFilePreviewUrl('');
    setUrlValue(next);
    setRemoveImage(false);
    setPreviewError(false);
    setPreviewUrl(next);
  }

  function handleRemove() {
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setFilePreviewUrl('');
    setRemoveImage(true);
    setUrlValue('');
    setPreviewUrl('');
    setPreviewError(false);
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="removeImage" value={removeImage ? '1' : '0'} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex h-28 w-full items-center justify-center overflow-hidden rounded-2xl border border-black/10 bg-slate-50 text-xs text-black/45 sm:w-32">
          {previewUrl && !previewError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Product preview"
              className="h-full w-full object-cover"
              onError={() => setPreviewError(true)}
            />
          ) : (
            <span>{previewError ? 'Preview unavailable' : 'No image'}</span>
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
        Upload JPEG, PNG or WebP up to 5 MB. Uploaded images are more reliable than pasted links.
      </div>
    </div>
  );
}
