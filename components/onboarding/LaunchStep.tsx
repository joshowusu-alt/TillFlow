'use client';

import { useState, useEffect } from 'react';
import type { StepProps } from './types';

export function LaunchStep({ onNext, onBack }: StepProps) {
  const [show, setShow] = useState(false);
  const [confetti, setConfetti] = useState(false);

  useEffect(() => {
    setShow(true);
    const t = setTimeout(() => setConfetti(true), 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={`transition-all duration-700 ${show ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
      {/* Confetti particles */}
      {confetti && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="absolute animate-bounce"
              style={{
                left: `${5 + (i * 4.5) % 90}%`,
                top: `${10 + (i * 7) % 50}%`,
                animationDelay: `${(i * 0.15) % 2}s`,
                animationDuration: `${1.5 + (i * 0.1) % 2}s`,
              }}
            >
              <div
                className="rounded-full"
                style={{
                  width: `${6 + (i % 4) * 2}px`,
                  height: `${6 + (i % 4) * 2}px`,
                  backgroundColor: ['#1E40AF', '#1D4ED8', '#f59e0b', '#8b5cf6', '#ec4899', '#3b82f6'][i % 6],
                  opacity: 0.5,
                }}
              />
            </div>
          ))}
        </div>
      )}

      <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent/80 shadow-xl shadow-accent/30">
        <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
        </svg>
      </div>

      <h2 className="text-3xl font-bold font-display mb-3">{"You're All Set!"}</h2>
      <p className="text-black/50 text-lg mb-8">Your store is ready. Time to make your first sale.</p>

      <div className="space-y-3 text-left mb-8">
        {[
          { label: 'Scan barcodes or search products', key: 'F2 / F3' },
          { label: 'Complete a sale instantly', key: 'Ctrl+Enter' },
          { label: 'Works offline - sales sync when reconnected', key: '' },
          { label: 'Print receipts to any thermal printer', key: '' },
        ].map((tip) => (
          <div key={tip.label} className="flex items-center gap-3 rounded-lg bg-accentSoft/50 border border-accent/10 px-4 py-2.5">
            <svg className="h-4 w-4 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></svg>
            <span className="text-sm flex-1">{tip.label}</span>
            {tip.key && <kbd className="rounded bg-black/10 px-2 py-0.5 text-[10px] font-mono text-black/50">{tip.key}</kbd>}
          </div>
        ))}
      </div>

      <button onClick={onNext} className="btn-primary w-full py-4 text-base shadow-xl shadow-blue-800/20 flex items-center justify-center gap-2">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.58-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
        </svg>
        Open the POS - Start Selling
      </button>

      <button onClick={onBack} className="mt-3 w-full text-sm text-black/30 hover:text-black/50 transition">
        Go back
      </button>
    </div>
  );
}
