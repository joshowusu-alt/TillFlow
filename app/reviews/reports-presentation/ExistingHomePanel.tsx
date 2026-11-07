'use client';

import { HomeIcon } from '@/components/owner-home/home-chrome';
import { stayOnReview } from '@/app/reviews/reports-presentation/CustomerScreen';

/**
 * Existing Home structure for comparison. Live performance and attention
 * figures are not loaded. This is not a Home redesign.
 */
export function ExistingHomePanel() {
  return (
    <div className="bg-[#f0f2f5] px-0 pb-4" data-existing-home="">
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
        Existing Home structure. Live performance and attention figures are not loaded here.
      </p>
      <div
        className="home-hero relative mt-2 overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 55%, #2563eb 100%)' }}
      >
        <div className="relative px-4 pb-5 pt-6">
          <h1 className="text-[1.6rem] font-black leading-tight tracking-tight text-white">Sample</h1>
          <p className="mt-1.5 text-[11px] text-blue-100/75">Today · All branches</p>
        </div>
      </div>
      <div className="px-4 py-5">
        <a
          href="/pos"
          onClick={stayOnReview}
          data-first-figure="true"
          className="flex min-h-14 items-center gap-4 rounded-2xl bg-accent px-4 py-4 text-white shadow-md"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20">
            <HomeIcon name="pos" />
          </span>
          <span>
            <span className="block text-sm font-bold">Open POS</span>
            <span className="mt-0.5 block text-xs text-white/70">Serve customers and record sales</span>
          </span>
        </a>
        <h2 className="mt-5 text-sm font-semibold text-ink">Needs attention</h2>
        <p className="mt-2 max-w-[65ch] text-sm leading-6 text-muted">
          Home lists what to do now. The live attention rows are not loaded on this review surface.
        </p>
      </div>
    </div>
  );
}
