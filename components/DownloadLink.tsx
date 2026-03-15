'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { useToast } from '@/components/ToastProvider';

type DownloadLinkProps = {
  href: string;
  className?: string;
  children: ReactNode;
  fallbackFilename?: string;
  disabled?: boolean;
};

export function resolveDownloadFilename(
  contentDisposition: string | null,
  href: string,
  fallbackFilename?: string
) {
  const utf8Match = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8Match) {
    return decodeURIComponent(utf8Match);
  }

  const plainMatch = contentDisposition?.match(/filename="?([^";]+)"?/i)?.[1];
  if (plainMatch) {
    return plainMatch;
  }

  if (fallbackFilename) {
    return fallbackFilename;
  }

  try {
    const url = new URL(href, 'http://localhost');
    const lastSegment = url.pathname.split('/').filter(Boolean).pop();
    return lastSegment || 'download';
  } catch {
    return fallbackFilename || 'download';
  }
}

export default function DownloadLink({
  href,
  className,
  children,
  fallbackFilename,
  disabled = false,
}: DownloadLinkProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const { toast } = useToast();

  const handleDownload = async () => {
    if (disabled || isDownloading) return;

    setIsDownloading(true);

    try {
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
      disabled={disabled || isDownloading}
      aria-busy={isDownloading}
      className={className}
    >
      {isDownloading ? 'Preparing download…' : children}
    </button>
  );
}
