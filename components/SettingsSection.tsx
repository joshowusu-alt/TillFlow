'use client';

import { useState } from 'react';

interface SettingsSectionProps {
  title: string;
  description?: string;
  badge?: string;
  defaultOpen?: boolean;
  eyebrow?: string;
  children: React.ReactNode;
}

export default function SettingsSection({
  title,
  description,
  badge,
  defaultOpen = false,
  eyebrow,
  children,
}: SettingsSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition hover:bg-black/[0.015] sm:px-5 sm:py-4"
      >
        <div className="min-w-0">
          {eyebrow ? (
            <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.2em] text-black/35">{eyebrow}</div>
          ) : null}
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink">{title}</span>
            {badge && (
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
                {badge}
              </span>
            )}
          </div>
          {description && (
            <div className="mt-0.5 text-xs leading-5 text-black/45 line-clamp-2 sm:line-clamp-1">{description}</div>
          )}
        </div>
        <svg
          className={`h-4 w-4 shrink-0 text-black/30 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-black/5 px-4 pb-5 pt-4 sm:px-5 sm:pb-6 sm:pt-5">
          {children}
        </div>
      )}
    </div>
  );
}
