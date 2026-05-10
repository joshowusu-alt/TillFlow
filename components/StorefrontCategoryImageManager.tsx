'use client';

import { useRef, useState } from 'react';
import { useToast } from '@/components/ToastProvider';

type CategoryImageItem = {
  id: string;
  name: string;
  imageUrl: string | null;
  published: number;
  total: number;
};

export default function StorefrontCategoryImageManager({
  categories,
}: {
  categories: CategoryImageItem[];
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState(categories);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [busyCategoryId, setBusyCategoryId] = useState<string | null>(null);
  const [urlInputs, setUrlInputs] = useState<Record<string, string>>({});
  const [errorByCategoryId, setErrorByCategoryId] = useState<Record<string, string>>({});
  const [failedImages, setFailedImages] = useState<ReadonlySet<string>>(new Set());

  function updateImage(categoryId: string, imageUrl: string) {
    setItems((current) =>
      current.map((category) =>
        category.id === categoryId ? { ...category, imageUrl } : category,
      ),
    );
    setFailedImages((current) => {
      const next = new Set(current);
      next.delete(categoryId);
      return next;
    });
  }

  function setCategoryError(categoryId: string, message: string | null) {
    setErrorByCategoryId((current) => {
      const next = { ...current };
      if (message) next[categoryId] = message;
      else delete next[categoryId];
      return next;
    });
  }

  function openUpload(categoryId: string) {
    setSelectedCategoryId(categoryId);
    setCategoryError(categoryId, null);
    fileInputRef.current?.click();
  }

  async function uploadImageFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const categoryId = selectedCategoryId;
    event.target.value = '';
    if (!file || !categoryId) return;

    setBusyCategoryId(categoryId);
    setCategoryError(categoryId, null);

    try {
      const formData = new FormData();
      formData.set('categoryId', categoryId);
      formData.set('imageFile', file);
      const response = await fetch('/api/settings/storefront-category-image', {
        method: 'POST',
        body: formData,
        credentials: 'same-origin',
      });
      const payload = (await response.json().catch(() => null)) as
        | { imageUrl?: string; error?: string }
        | null;
      if (!response.ok || !payload?.imageUrl) {
        throw new Error(payload?.error || 'Could not upload this category image.');
      }
      updateImage(categoryId, payload.imageUrl);
      toast('Category image saved.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not upload this category image.';
      setCategoryError(categoryId, message);
      toast(message, 'error');
    } finally {
      setBusyCategoryId(null);
      setSelectedCategoryId(null);
    }
  }

  async function saveImageUrl(categoryId: string) {
    const imageUrl = urlInputs[categoryId]?.trim() ?? '';
    if (!imageUrl) {
      setCategoryError(categoryId, 'Paste a direct JPEG, PNG or WebP image URL first.');
      return;
    }

    setBusyCategoryId(categoryId);
    setCategoryError(categoryId, null);

    try {
      const formData = new FormData();
      formData.set('categoryId', categoryId);
      formData.set('imageUrl', imageUrl);
      const response = await fetch('/api/settings/storefront-category-image', {
        method: 'POST',
        body: formData,
        credentials: 'same-origin',
      });
      const payload = (await response.json().catch(() => null)) as
        | { imageUrl?: string; error?: string }
        | null;
      if (!response.ok || !payload?.imageUrl) {
        throw new Error(payload?.error || 'Could not save this category image URL.');
      }
      updateImage(categoryId, payload.imageUrl);
      setUrlInputs((current) => ({ ...current, [categoryId]: '' }));
      toast('Category image saved.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save this category image URL.';
      setCategoryError(categoryId, message);
      toast(message, 'error');
    } finally {
      setBusyCategoryId(null);
    }
  }

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={uploadImageFile}
      />
      <div className="grid gap-3 lg:grid-cols-2">
        {items.map((category) => {
          const busy = busyCategoryId === category.id;
          const hasUsableImage = Boolean(category.imageUrl && !failedImages.has(category.id));

          return (
            <div key={category.id} className="rounded-2xl border border-black/5 bg-white p-3 shadow-sm">
              <div className="flex gap-3">
                {hasUsableImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={category.imageUrl ?? ''}
                    alt={category.name}
                    className="h-16 w-16 shrink-0 rounded-xl object-cover"
                    onError={() =>
                      setFailedImages((current) => {
                        const next = new Set(current);
                        next.add(category.id);
                        return next;
                      })
                    }
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg font-black text-slate-400">
                    {category.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink">{category.name}</div>
                  <div className="mt-0.5 text-xs text-black/45">
                    {category.published} live of {category.total} products
                  </div>
                  <div className={`mt-1 text-[10px] font-semibold ${category.imageUrl ? 'text-emerald-600' : 'text-amber-700'}`}>
                    {category.imageUrl ? 'Fallback image ready' : 'Needs category image'}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => openUpload(category.id)}
                  disabled={busy}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-black/10 bg-white px-3 text-xs font-semibold text-black/65 transition hover:border-black/20 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? 'Saving...' : 'Upload'}
                </button>
                <input
                  type="url"
                  className="input h-10 flex-1 text-xs"
                  placeholder="Paste direct image URL"
                  value={urlInputs[category.id] ?? ''}
                  onChange={(event) =>
                    setUrlInputs((current) => ({ ...current, [category.id]: event.target.value }))
                  }
                />
                <button
                  type="button"
                  onClick={() => void saveImageUrl(category.id)}
                  disabled={busy}
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Save URL
                </button>
              </div>
              {errorByCategoryId[category.id] ? (
                <div className="mt-2 text-xs text-rose-600">{errorByCategoryId[category.id]}</div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
