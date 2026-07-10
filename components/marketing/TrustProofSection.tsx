'use client';

import { useEffect, useRef, useState, type TouchEvent } from 'react';
import RevealOnScroll from '@/components/marketing/RevealOnScroll';
import { BUSINESS_STORIES, BUSINESS_STORIES_SECTION } from '@/lib/marketing/welcome-content';

const AUTO_ADVANCE_MS = 5500;
const TRANSITION_MS = 150;
const SWIPE_THRESHOLD_PX = 40;

/**
 * Business-story carousel. Auto-advances between retailers, pauses on hover/touch,
 * stops advancing permanently once the visitor navigates manually.
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
      goTo((activeIndex + 1) % BUSINESS_STORIES.length, { auto: true });
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
      goTo((activeIndex + 1) % BUSINESS_STORIES.length);
    } else {
      goTo((activeIndex - 1 + BUSINESS_STORIES.length) % BUSINESS_STORIES.length);
    }
  }

  const active = BUSINESS_STORIES[activeIndex];

  const dots = (
    <div className="flex items-center justify-center gap-2" role="group" aria-label="Business stories">
      {BUSINESS_STORIES.map((story, index) => (
        <button
          key={story.id}
          type="button"
          aria-current={index === activeIndex}
          aria-label={`Show story: ${story.business}`}
          onClick={() => goTo(index)}
          className={`h-2 rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
            index === activeIndex ? 'w-6 bg-accent' : 'w-2 bg-slate-300 hover:bg-slate-400'
          }`}
        />
      ))}
    </div>
  );

  return (
    <section id="stories" className="scroll-mt-32 px-4 py-6 sm:px-6 sm:py-9">
      <RevealOnScroll>
        <div
          className="mx-auto max-w-6xl rounded-[2rem] border border-slate-200/80 bg-white p-5 shadow-card sm:p-6 lg:p-7"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
            {BUSINESS_STORIES_SECTION.eyebrow}
          </p>
          <h2 className="mt-3 text-3xl font-bold font-display text-ink sm:text-4xl">
            {BUSINESS_STORIES_SECTION.headline}
          </h2>
          <p className="mt-3 text-base leading-7 text-ink/58">{BUSINESS_STORIES_SECTION.intro}</p>

          <div className="mt-5 grid gap-2 sm:grid-cols-3" aria-label="Business transformations">
            {BUSINESS_STORIES.map((story, index) => (
              <button
                key={story.id}
                type="button"
                aria-pressed={index === activeIndex}
                onClick={() => goTo(index)}
                className={`rounded-xl border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                  index === activeIndex
                    ? 'border-accent/25 bg-accentSoft/45'
                    : 'border-slate-200/80 bg-slate-50/55 hover:border-accent/20'
                }`}
              >
                <span className="block text-xs font-semibold text-ink">{story.business}</span>
                <span className="mt-1 block text-xs leading-5 text-ink/60">{story.hook}</span>
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Full story</p>
              <p className="mt-2 text-base font-semibold text-ink">{active.business}</p>
              <p className="mt-1 text-sm text-ink/55">
                {active.person} · {active.focus}
              </p>
            </div>

            <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
              <div
                className={`min-h-[280px] rounded-[1.25rem] border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-blue-50/70 p-4 transition-all duration-150 ease-out sm:min-h-[260px] sm:p-5 ${
                  isAnimating ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'
                }`}
                aria-live="polite"
              >
                <StoryBeat label="Before" text={active.before} />
                <StoryBeat label="Problem" text={active.problem} className="mt-3" />
                <StoryBeat label="Turning point" text={active.turningPoint} className="mt-3" />
                <StoryBeat label="Life now" text={active.lifeNow} className="mt-3" emphasize />
              </div>

              <div className="mt-4 hidden items-center justify-center gap-4 lg:flex">
                <button
                  type="button"
                  onClick={() => goTo((activeIndex - 1 + BUSINESS_STORIES.length) % BUSINESS_STORIES.length)}
                  aria-label="Previous business story"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-ink/40 shadow-sm transition hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                >
                  ‹
                </button>
                {dots}
                <button
                  type="button"
                  onClick={() => goTo((activeIndex + 1) % BUSINESS_STORIES.length)}
                  aria-label="Next business story"
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

function StoryBeat({
  label,
  text,
  className = '',
  emphasize = false,
}: {
  label: string;
  text: string;
  className?: string;
  emphasize?: boolean;
}) {
  return (
    <div className={className}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">{label}</p>
      <p className={`mt-1 text-sm leading-6 ${emphasize ? 'font-semibold text-ink' : 'text-ink/70'}`}>{text}</p>
    </div>
  );
}
