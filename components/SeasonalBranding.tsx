'use client';

import { useSyncExternalStore } from 'react';
import { isChristmasSeason } from '@/lib/branding/christmas-season';

function subscribe(onChange: () => void) {
  const timer = window.setInterval(onChange, 30_000);
  window.addEventListener('focus', onChange);
  document.addEventListener('visibilitychange', onChange);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener('focus', onChange);
    document.removeEventListener('visibilitychange', onChange);
  };
}

const getSnapshot = () => isChristmasSeason(new Date());
// Static and cached pages must never retain an out-of-season banner.
const getServerSnapshot = () => false;

function useChristmasSeason() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function ChristmasHat({ logoHeight }: { logoHeight: number }) {
  const festive = useChristmasSeason();
  if (!festive) return null;
  return (
    <svg
      aria-hidden="true"
      data-christmas-hat
      viewBox="0 0 64 48"
      className="pointer-events-none absolute z-10 overflow-visible"
      style={{
        width: logoHeight * 0.75,
        height: logoHeight * 0.5625,
        left: -logoHeight * 0.08,
        top: -logoHeight * 0.28,
        transform: 'rotate(-14deg)',
      }}
    >
      <path d="M12 35C18 14 29 5 42 6c8 0 12 7 15 17l-8 3c-3-6-6-9-9-7l5 16Z" fill="#B91C1C" stroke="#991B1B" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 32c10 0 26-1 38 2a5 5 0 0 1 3 6v2a4 4 0 0 1-5 4c-11-3-25-2-36-1a5 5 0 0 1-5-5v-3a5 5 0 0 1 5-5Z" fill="white" stroke="#CBD5E1" strokeWidth="1.5" />
      <circle cx="55" cy="25" r="7" fill="white" stroke="#CBD5E1" strokeWidth="1.5" />
    </svg>
  );
}

export function ChristmasMessage({ className = '' }: { className?: string }) {
  const festive = useChristmasSeason();
  // Keep the same height across hydration and the season boundary.
  return (
    <div className={`min-h-[28px] text-center text-xs leading-5 text-[#B91C1C] ${className}`}>
      <span className={festive ? undefined : 'invisible'} aria-hidden={!festive}>
        Christ is the reason for the season 🎄
      </span>
    </div>
  );
}
