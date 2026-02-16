import { memo } from 'react';

interface Props {
  show: boolean;
  onClose: () => void;
}

function KeyboardHelpModal({ show, onClose }: Props) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-display font-semibold">Keyboard Shortcuts</h3>
          <button
            type="button"
            className="rounded-lg p-1 hover:bg-black/5"
            onClick={onClose}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <div className="text-xs uppercase tracking-wide text-black/50">Navigation</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2">
              <kbd className="rounded bg-black/10 px-2 py-1 text-xs font-mono">F2</kbd>
              <span>Barcode field</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="rounded bg-black/10 px-2 py-1 text-xs font-mono">F3</kbd>
              <span>Product search</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="rounded bg-black/10 px-2 py-1 text-xs font-mono">F4</kbd>
              <span>Quantity field</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="rounded bg-black/10 px-2 py-1 text-xs font-mono">F8</kbd>
              <span>Cash field</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="rounded bg-black/10 px-2 py-1 text-xs font-mono">/</kbd>
              <span>Focus barcode</span>
            </div>
          </div>
          <div className="mt-4 text-xs uppercase tracking-wide text-black/50">Actions</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2">
              <kbd className="rounded bg-black/10 px-2 py-1 text-xs font-mono">Ctrl+Enter</kbd>
              <span>Complete sale</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="rounded bg-black/10 px-2 py-1 text-xs font-mono">Ctrl+Backspace</kbd>
              <span>Remove last item</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="rounded bg-black/10 px-2 py-1 text-xs font-mono">Delete</kbd>
              <span>Remove selected</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="rounded bg-black/10 px-2 py-1 text-xs font-mono">Ctrl+P</kbd>
              <span>Reprint last</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="rounded bg-black/10 px-2 py-1 text-xs font-mono">F9</kbd>
              <span>Park sale</span>
            </div>
          </div>
          <div className="mt-4 text-xs uppercase tracking-wide text-black/50">Help</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2">
              <kbd className="rounded bg-black/10 px-2 py-1 text-xs font-mono">?</kbd>
              <span>Toggle this help</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="rounded bg-black/10 px-2 py-1 text-xs font-mono">Esc</kbd>
              <span>Close dialog</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="btn-primary mt-6 w-full"
          onClick={onClose}
        >
          Got it
        </button>
      </div>
    </div>
  );
}

export default memo(KeyboardHelpModal);
