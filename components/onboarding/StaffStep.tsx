'use client';

import { useState, useEffect } from 'react';
import type { StepProps } from './types';

export function StaffStep({ onNext, onBack }: StepProps) {
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(true); }, []);

  return (
    <div className={`transition-all duration-500 ${show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-purple-600 shadow-lg shadow-purple-500/25">
        <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
      </div>

      <h2 className="text-2xl font-bold font-display mb-2">Your Team</h2>
      <p className="text-black/40 text-sm mb-6">Add cashiers and managers. You can do this later too.</p>

      <div className="space-y-3 text-left">
        <div className="rounded-xl border border-black/5 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-black/5 bg-black/[.02]">
            <div className="text-xs font-semibold uppercase tracking-wide text-black/30">Role permissions</div>
          </div>
          {[
            { role: 'Owner', desc: 'Full access to everything', color: 'bg-emerald-100 text-emerald-700', check: 'Settings, Users, Reports, POS' },
            { role: 'Manager', desc: 'Operations & reporting', color: 'bg-accentSoft text-accent', check: 'Inventory, Purchases, Reports, POS' },
            { role: 'Cashier', desc: 'Sales only', color: 'bg-amber-100 text-amber-700', check: 'POS, Shifts' },
          ].map((r) => (
            <div key={r.role} className="flex items-start gap-3 px-4 py-3 border-b last:border-0 border-black/5">
              <span className={`mt-0.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${r.color}`}>{r.role}</span>
              <div>
                <div className="text-sm font-medium">{r.desc}</div>
                <div className="text-xs text-black/40 mt-0.5">{r.check}</div>
              </div>
            </div>
          ))}
        </div>

        <a href="/users" className="flex items-center justify-between rounded-xl border border-black/5 bg-white p-4 transition hover:border-purple-200 hover:shadow-md group">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600 transition group-hover:bg-purple-100">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" /></svg>
            </div>
            <div>
              <div className="font-semibold text-sm">Add Staff Members</div>
              <div className="text-xs text-black/40">Create cashier and manager accounts</div>
            </div>
          </div>
          <svg className="h-5 w-5 text-black/20 transition group-hover:text-purple-500 group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </a>
      </div>

      <div className="mt-8 flex gap-3">
        <button onClick={onBack} className="btn-ghost flex-1 py-3">Back</button>
        <button onClick={onNext} className="btn-primary flex-1 py-3 shadow-lg shadow-blue-800/15">Next</button>
      </div>
    </div>
  );
}
