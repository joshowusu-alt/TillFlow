'use client';

import { useState, useEffect } from 'react';
import type { StepProps } from './types';

export function WelcomeStep({ onNext }: StepProps) {
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(true); }, []);

  return (
    <div className={`transition-all duration-700 ${show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
      <div className="relative mx-auto mb-8 flex h-24 w-24 items-center justify-center">
        <div className="absolute inset-0 animate-ping rounded-full bg-accent/20 opacity-20" />
        <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent/80 shadow-xl shadow-accent/30">
          <svg className="h-12 w-12 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
          </svg>
        </div>
      </div>

      <h1 className="text-3xl font-bold font-display mb-3">Welcome to TillFlow</h1>
      <p className="text-black/50 text-lg mb-2">Your complete point of sale system.</p>

      <div className="my-8 grid gap-3 text-left">
        {[
          { icon: '1', label: 'Set up your business', desc: 'Name, currency, and preferences' },
          { icon: '2', label: 'Add your first products', desc: 'Or explore with demo products' },
          { icon: '3', label: 'Make your first sale', desc: 'Right here in the setup wizard' },
        ].map((item) => (
          <div key={item.icon} className="flex items-center gap-4 rounded-xl bg-accentSoft/50 border border-accent/10 p-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent/80 text-sm font-bold text-white shadow">
              {item.icon}
            </div>
            <div>
              <div className="font-semibold text-sm">{item.label}</div>
              <div className="text-xs text-black/40">{item.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-sm text-black/40 mb-8">This takes about 2 minutes. You can skip anytime.</p>

      <button onClick={onNext} className="btn-primary w-full py-3.5 text-base shadow-lg shadow-blue-800/15">
        {"Let's Go"}
      </button>
    </div>
  );
}
