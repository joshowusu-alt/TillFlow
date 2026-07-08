'use client';

import { useEffect, useRef, useState } from 'react';

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function format(value: number, decimals: number) {
  return value.toLocaleString('en-GH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Animates a headline figure from 0 to its final value once it first scrolls
 * into view. Fires once per element, respects prefers-reduced-motion (renders
 * the final value immediately), and keeps currency/thousands formatting
 * correct on every frame. A visually-hidden node carries the final value for
 * assistive tech so the announced figure never depends on animation timing.
 */
export default function CountUp({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  duration = 850,
  className = '',
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimatedRef = useRef(false);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      setDisplay(value);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || hasAnimatedRef.current) return;
        hasAnimatedRef.current = true;
        observer.disconnect();

        const start = performance.now();
        let frame = 0;

        const tick = (now: number) => {
          const progress = Math.min((now - start) / duration, 1);
          setDisplay(value * easeOutCubic(progress));
          if (progress < 1) {
            frame = requestAnimationFrame(tick);
          } else {
            setDisplay(value);
          }
        };

        setDisplay(0);
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
      },
      { threshold: 0.4 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [value, duration]);

  return (
    <span className={className}>
      <span ref={ref} aria-hidden="true" className="tabular-nums">
        {prefix}
        {format(display, decimals)}
        {suffix}
      </span>
      <span className="sr-only">
        {prefix}
        {format(value, decimals)}
        {suffix}
      </span>
    </span>
  );
}
