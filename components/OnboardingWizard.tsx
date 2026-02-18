'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface StepProps {
  onNext: () => void;
  onBack?: () => void;
  isFirst: boolean;
  isLast: boolean;
}

/* ---------- Step 1: Welcome with animation ---------- */
function WelcomeStep({ onNext }: StepProps) {
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(true); }, []);

  return (
    <div className={`transition-all duration-700 ${show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
      <div className="relative mx-auto mb-8 flex h-24 w-24 items-center justify-center">
        <div className="absolute inset-0 animate-ping rounded-full bg-blue-200 opacity-20" />
        <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 shadow-xl shadow-blue-700/30">
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
          <div key={item.icon} className="flex items-center gap-4 rounded-xl bg-blue-50/50 border border-blue-100 p-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-sm font-bold text-white shadow">
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

/* ---------- Step 2: Business Config (inline) ---------- */
function BusinessStep({ onNext, onBack }: StepProps) {
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(true); }, []);

  return (
    <div className={`transition-all duration-500 ${show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/25">
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
      </div>

      <div className="mt-8 flex gap-3">
        <button onClick={onBack} className="btn-ghost flex-1 py-3">Back</button>
        <button onClick={onNext} className="btn-primary flex-1 py-3 shadow-lg shadow-blue-800/15">Next</button>
      </div>
    </div>
  );
}

/* ---------- Step 3: Products ---------- */
function ProductsStep({ onNext, onBack }: StepProps) {
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

        <a href="/products" className="flex items-center justify-between rounded-xl border border-black/5 bg-white p-4 transition hover:border-emerald-200 hover:shadow-md group">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition group-hover:bg-emerald-100">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            </div>
            <div>
              <div className="font-semibold text-sm">Add Your Products</div>
              <div className="text-xs text-black/40">Enter names, prices, barcodes, and units</div>
            </div>
          </div>
          <svg className="h-5 w-5 text-black/20 transition group-hover:text-emerald-500 group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </a>

        <a href="/products?tab=categories" className="flex items-center justify-between rounded-xl border border-black/5 bg-white p-4 transition hover:border-blue-200 hover:shadow-md group">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition group-hover:bg-blue-100">
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

/* ---------- Step 4: Staff ---------- */
function StaffStep({ onNext, onBack }: StepProps) {
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
            { role: 'Manager', desc: 'Operations & reporting', color: 'bg-blue-100 text-blue-700', check: 'Inventory, Purchases, Reports, POS' },
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

/* ---------- Step 5: Celebration / Launch ---------- */
function LaunchStep({ onNext, onBack }: StepProps) {
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
                  backgroundColor: ['#059669', '#0d9488', '#f59e0b', '#8b5cf6', '#ec4899', '#3b82f6'][i % 6],
                  opacity: 0.5,
                }}
              />
            </div>
          ))}
        </div>
      )}

      <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 shadow-xl shadow-emerald-500/30">
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
          <div key={tip.label} className="flex items-center gap-3 rounded-lg bg-blue-50/50 border border-blue-100 px-4 py-2.5">
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

/* ---------- Main Wizard ---------- */
const STEP_COMPONENTS = [WelcomeStep, BusinessStep, ProductsStep, StaffStep, LaunchStep];

export default function OnboardingWizard({ onComplete }: { onComplete?: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);
  const router = useRouter();

  const isFirst = currentStep === 0;
  const isLast = currentStep === STEP_COMPONENTS.length - 1;

  const handleNext = () => {
    if (isLast) {
      localStorage.setItem('onboarding-complete', 'true');
      onComplete?.();
      router.push('/pos');
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    if (!isFirst) setCurrentStep((s) => s - 1);
  };

  const handleSkip = () => {
    localStorage.setItem('onboarding-complete', 'true');
    onComplete?.();
    router.push('/pos');
  };

  const StepComponent = STEP_COMPONENTS[currentStep];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex gap-2 flex-1 mr-4">
            {STEP_COMPONENTS.map((_, index) => (
              <div key={index} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-black/5">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-500"
                  style={{ width: index <= currentStep ? '100%' : '0%' }}
                />
              </div>
            ))}
          </div>
          <span className="text-xs font-mono text-black/30">{currentStep + 1}/{STEP_COMPONENTS.length}</span>
        </div>

        {/* Card */}
        <div className="relative rounded-3xl border border-black/5 bg-white/95 p-8 shadow-xl shadow-black/5 backdrop-blur-sm text-center overflow-hidden">
          <StepComponent
            onNext={handleNext}
            onBack={handleBack}
            isFirst={isFirst}
            isLast={isLast}
          />
        </div>

        {/* Skip */}
        <div className="mt-4 text-center">
          <button onClick={handleSkip} className="text-sm text-black/30 hover:text-black/50 transition">
            Skip setup - go to POS
          </button>
        </div>
      </div>
    </div>
  );
}
