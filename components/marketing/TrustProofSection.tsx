'use client';

import { useEffect, useRef, useState, type TouchEvent } from 'react';
import RevealOnScroll from '@/components/marketing/RevealOnScroll';
import { TRUST_PROOF, TRUST_PROOF_THEMES } from '@/lib/marketing/welcome-content';

const AUTO_ADVANCE_MS = 4500;
const TRANSITION_MS = 150;
const SWIPE_THRESHOLD_PX = 40;

/**
 * Compact proof carousel for a single named customer (EL-SHADDAI / Akosua).
 * Auto-advances between proof angles, pauses on hover/touch, stops advancing
 * permanently once the visitor navigates manually, and always keeps content
 * readable without waiting on the transition.
 */
export default function TrustProofSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const hasInteractedRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const touchStartXRef = useRef<number | null>(null);

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    if (reducedMotionRef.current || hasInteractedRef.current || isPaused) return;

    const timer = window.setInterval(() => {
      goTo((activeIndex + 1) % TRUST_PROOF_THEMES.length, { auto: true });
    }, AUTO_ADVANCE_MS);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, isPaused]);

  function goTo(target: number, opts: { auto?: boolean } = {}) {
    if (target === activeIndex) return;
    if (!opts.auto) hasInteractedRef.current = true;

    if (reducedMotionRef.current) {
      setActiveIndex(target);
      return;
    }

    setIsAnimating(true);
    window.setTimeout(() => {
      setActiveIndex(target);
      setIsAnimating(false);
    }, TRANSITION_MS);
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    touchStartXRef.current = event.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const startX = touchStartXRef.current;
    touchStartXRef.current = null;
    if (startX === null) return;

    const deltaX = (event.changedTouches[0]?.clientX ?? startX) - startX;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) return;

    if (deltaX < 0) {
      goTo((activeIndex + 1) % TRUST_PROOF_THEMES.length);
    } else {
      goTo((activeIndex - 1 + TRUST_PROOF_THEMES.length) % TRUST_PROOF_THEMES.length);
    }
  }

  const active = TRUST_PROOF_THEMES[activeIndex];

  const dots = (
    <div className="flex items-center justify-center gap-2" role="group" aria-label="Proof points">
      {TRUST_PROOF_THEMES.map((theme, index) => (
        <button
          key={theme.title}
          type="button"
          aria-current={index === activeIndex}
          aria-label={`Show proof: ${theme.title}`}
          onClick={() => goTo(index)}
          className={`h-2 rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
            index === activeIndex ? 'w-6 bg-accent' : 'w-2 bg-slate-300 hover:bg-slate-400'
          }`}
        />
      ))}
    </div>
  );

  return (
    <section id="trust" className="scroll-mt-24 px-4 py-6 sm:px-6 sm:py-9">
      <RevealOnScroll>
        <div
          className="mx-auto max-w-6xl rounded-[2rem] border border-slate-200/80 bg-white p-5 shadow-card sm:p-6 lg:p-7"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">Trusted in Ghana</p>
              <h2 className="mt-3 text-3xl font-bold font-display text-ink sm:text-4xl">{TRUST_PROOF.headline}</h2>
              <p className="mt-4 text-base leading-7 text-ink/58">{TRUST_PROOF.intro}</p>
              <p className="mt-3 text-sm font-semibold text-ink/70">
                {TRUST_PROOF.person}, {TRUST_PROOF.business}
              </p>
            </div>

            <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
              <div
                className={`min-h-[168px] rounded-[1.25rem] border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-blue-50/70 p-4 transition-all duration-150 ease-out sm:min-h-[144px] sm:p-5 ${
                  isAnimating ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'
                }`}
                aria-live="polite"
              >
                <h3 className="text-base font-semibold font-display text-ink">{active.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink/70">&ldquo;{active.quote}&rdquo;</p>
                <p className="mt-3 text-xs font-bold text-accent">
                  {TRUST_PROOF.person}, {TRUST_PROOF.business}
                </p>
              </div>

              {/* Desktop: subtle arrows alongside dots. Mobile: dots only, swipe handles navigation. */}
              <div className="mt-4 hidden items-center justify-center gap-4 lg:flex">
                <button
                  type="button"
                  onClick={() => goTo((activeIndex - 1 + TRUST_PROOF_THEMES.length) % TRUST_PROOF_THEMES.length)}
                  aria-label="Previous proof point"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-ink/40 shadow-sm transition hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                >
                  ‹
                </button>
                {dots}
                <button
                  type="button"
                  onClick={() => goTo((activeIndex + 1) % TRUST_PROOF_THEMES.length)}
                  aria-label="Next proof point"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-ink/40 shadow-sm transition hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                >
                  ›
                </button>
              </div>
              <div className="mt-4 flex lg:hidden">{dots}</div>
            </div>
          </div>
        </div>
      </RevealOnScroll>
    </section>
  );
}
