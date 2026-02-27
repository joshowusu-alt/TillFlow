'use client';

import { useState, useEffect, useTransition } from 'react';
import { setStoreModeAction } from '@/app/actions/settings';
import type { StepProps } from './types';

export function BusinessStep({ onNext, onBack }: StepProps) {
  const [show, setShow] = useState(false);
  const [storeMode, setStoreMode] = useState<'SINGLE_STORE' | 'MULTI_STORE'>('SINGLE_STORE');
  const [isSaving, startSaving] = useTransition();
  useEffect(() => { setShow(true); }, []);

  const handleNext = () => {
    startSaving(async () => {
      await setStoreModeAction(storeMode);
      onNext();
    });
  };

  return (
    <div className={`transition-all duration-500 ${show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent/80 shadow-lg shadow-accent/25">
        <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.15c0 .415.336.75.75.75z" />
        </svg>
      </div>

      <h2 className="text-2xl font-bold font-display mb-2">Your Business</h2>
      <p className="text-black/40 text-sm mb-6">You can change any of these later in Settings.</p>

      <div className="space-y-4 text-left">
        <div className="rounded-xl bg-blue-50/50 border border-blue-100 p-4">
          <div className="flex items-center gap-3">
            <svg className="h-5 w-5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></svg>
            <div>
              <div className="font-semibold text-sm">Business name and currency are set!</div>
              <div className="text-xs text-black/40 mt-0.5">You entered these during registration.</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-black/5 bg-white p-4 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-black/30">Quick configuration</div>
          <a href="/settings" className="flex items-center justify-between rounded-lg border border-black/5 bg-black/[.02] px-4 py-3 text-sm font-medium transition hover:bg-black/[.04] hover:border-black/10">
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5 text-black/30" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              <span>Open Full Settings</span>
            </div>
            <svg className="h-4 w-4 text-black/30" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          </a>
        </div>

        <div className="rounded-xl border border-black/5 bg-white p-4 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-black/30">How many branches?</div>
          <p className="text-xs text-black/40">This hides branch-related features if you only have one store, keeping your interface cleaner.</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setStoreMode('SINGLE_STORE')}
              className={`rounded-lg border p-3 text-left transition ${
                storeMode === 'SINGLE_STORE'
                  ? 'border-accent bg-accentSoft/50 ring-1 ring-accent/30'
                  : 'border-black/10 hover:border-black/20'
              }`}
            >
              <div className="font-semibold text-sm">Single store</div>
              <div className="text-xs text-black/40 mt-0.5">Just one location</div>
            </button>
            <button
              type="button"
              onClick={() => setStoreMode('MULTI_STORE')}
              className={`rounded-lg border p-3 text-left transition ${
                storeMode === 'MULTI_STORE'
                  ? 'border-accent bg-accentSoft/50 ring-1 ring-accent/30'
                  : 'border-black/10 hover:border-black/20'
              }`}
            >
              <div className="font-semibold text-sm">Multiple stores</div>
              <div className="text-xs text-black/40 mt-0.5">Branches &amp; transfers</div>
            </button>
          </div>
        </div>
      </div>

      <div className="mt-8 flex gap-3">
        <button onClick={onBack} className="btn-ghost flex-1 py-3">Back</button>
        <button onClick={handleNext} disabled={isSaving} className="btn-primary flex-1 py-3 shadow-lg shadow-blue-800/15 disabled:opacity-50">
          {isSaving ? 'Saving...' : 'Next'}
        </button>
      </div>
    </div>
  );
}
