'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { useToast } from '@/components/ToastProvider';
import { resolveDownloadFilename } from '@/components/DownloadLink';

type DownloadFormButtonProps = {
  formId: string;
  action: string;
  className?: string;
  children: ReactNode;
  fallbackFilename?: string;
};

function buildDownloadHref(form: HTMLFormElement, action: string) {
  const url = new URL(action, window.location.origin);
  const formData = new FormData(form);

  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string' && value.length > 0) {
      url.searchParams.set(key, value);
    }
  }

  return `${url.pathname}${url.search}`;
}

export default function DownloadFormButton({
  formId,
  action,
  className,
  children,
  fallbackFilename,
}: DownloadFormButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const { toast } = useToast();

  const handleDownload = async () => {
    if (isDownloading) return;

    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) {
      toast('Could not prepare this export form. Please reload and try again.', 'error');
      return;
    }

    setIsDownloading(true);

    try {
      const href = buildDownloadHref(form, action);
      const response = await fetch(href, {
        method: 'GET',
        credentials: 'same-origin',
      });

      if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}`);
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (response.redirected && response.url.includes('/login')) {
        window.location.assign(response.url);
        return;
      }

      if (contentType.includes('text/html') && !response.headers.get('content-disposition')) {
        window.location.assign(href);
        return;
      }

      const blob = await response.blob();
      const filename = resolveDownloadFilename(
        response.headers.get('content-disposition'),
        href,
        fallbackFilename
      );
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1500);
    } catch (error) {
      console.error('Download failed:', error);
      toast('Could not download this export right now. Please try again.', 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={isDownloading}
      aria-busy={isDownloading}
      className={className}
    >
      {isDownloading ? 'Preparing download…' : children}
    </button>
  );
}
