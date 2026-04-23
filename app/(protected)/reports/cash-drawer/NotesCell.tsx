'use client';

import { useMemo, useState } from 'react';
import ResponsiveModal from '@/components/ResponsiveModal';

type NotesCellProps = {
  text: string;
};

const PREVIEW_LIMIT = 90;

function previewText(text: string): string {
  if (text.length <= PREVIEW_LIMIT) return text;
  return `${text.slice(0, PREVIEW_LIMIT)}...`;
}

export default function NotesCell({ text }: NotesCellProps) {
  const [open, setOpen] = useState(false);
  const preview = useMemo(() => previewText(text), [text]);
  const isShort = text.length <= PREVIEW_LIMIT;

  return (
    <>
      <div className="max-w-[22rem] whitespace-pre-wrap break-words text-black/60" title={text}>
        {preview}
      </div>
      {!isShort ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-1 text-xs font-medium text-accent hover:underline"
        >
          View full note
        </button>
      ) : null}

      <ResponsiveModal
        open={open}
        onClose={() => setOpen(false)}
        ariaLabel="Full shift note"
        maxWidthClassName="max-w-2xl"
        panelClassName="p-5 sm:p-6"
      >
        <h3 className="text-lg font-semibold text-black">Full note</h3>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-black/70">{text}</p>
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={() => setOpen(false)} className="btn-ghost" data-autofocus="true">
            Close
          </button>
        </div>
      </ResponsiveModal>
    </>
  );
}
