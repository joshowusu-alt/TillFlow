'use client';

import { useState, useEffect } from 'react';
import type { StepProps } from './types';

export function ProductsStep({ onNext, onBack }: StepProps) {
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(true); }, []);

  return (
    <div className={`transition-all duration-500 ${show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/25">
        <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>
      </div>

      <h2 className="text-2xl font-bold font-display mb-2">Your Products</h2>
      <p className="text-black/40 text-sm mb-6">Add your real products or explore the demo catalog first.</p>

      <div className="space-y-3 text-left">
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
          <div className="flex items-start gap-3">
            <span className="text-lg mt-0.5">&#128161;</span>
            <div>
              <div className="font-semibold text-sm text-amber-900">Demo catalog loaded</div>
              <div className="text-xs text-amber-700/70 mt-0.5">
                10 products are pre-loaded so you can try the POS immediately.
                Add your own products anytime.
              </div>
            </div>
          </div>
        </div>

        <a href="/products" className="flex items-center justify-between rounded-xl border border-black/5 bg-white p-4 transition hover:border-blue-200 hover:shadow-md group">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-accent transition group-hover:bg-blue-100">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            </div>
            <div>
              <div className="font-semibold text-sm">Add Your Products</div>
              <div className="text-xs text-black/40">Enter names, prices, barcodes, and units</div>
            </div>
          </div>
          <svg className="h-5 w-5 text-black/20 transition group-hover:text-accent group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </a>

        <a href="/products?tab=categories" className="flex items-center justify-between rounded-xl border border-black/5 bg-white p-4 transition hover:border-accent/20 hover:shadow-md group">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accentSoft text-accent transition group-hover:bg-accent/20">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>
            </div>
            <div>
              <div className="font-semibold text-sm">Manage Categories</div>
              <div className="text-xs text-black/40">Organize products into groups</div>
            </div>
          </div>
          <svg className="h-5 w-5 text-black/20 transition group-hover:text-blue-500 group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </a>
      </div>

      <div className="mt-8 flex gap-3">
        <button onClick={onBack} className="btn-ghost flex-1 py-3">Back</button>
        <button onClick={onNext} className="btn-primary flex-1 py-3 shadow-lg shadow-blue-800/15">Next</button>
      </div>
    </div>
  );
}
