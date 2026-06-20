'use client';

import { useEffect, useState } from 'react';
import { Logo } from './Logo';

type AppLaunchLoadingProps = {
  businessName?: string | null;
  message?: string;
  detail?: string;
  mode?: 'launch' | 'internal';
  shell?: 'fullscreen' | 'content' | 'launch';
  showProgress?: boolean;
};

const INTERNAL_MESSAGE = 'Loading section...';
const INTERNAL_DETAIL = 'Please wait while TillFlow gets this section ready.';
const LAUNCH_MESSAGE = 'Opening your business workspace...';
const LAUNCH_DETAIL = 'Getting sales, stock, and cash ready.';

function readLastBusinessName() {
  try {
    return window.localStorage.getItem('tillflow:lastBusinessName')?.trim() || null;
  } catch {
    return null;
  }
}

function readLaunchMode() {
  try {
    return (
      window.sessionStorage.getItem('tillflow:launching') === '1' &&
      window.sessionStorage.getItem('tillflow:launchSplashSeen') !== '1'
    );
  } catch {
    return false;
  }
}

export default function AppLaunchLoading({
  businessName,
  message,
  detail,
  mode = 'internal',
  shell = 'content',
  showProgress = true,
}: AppLaunchLoadingProps) {
  const [lastBusinessName, setLastBusinessName] = useState<string | null>(businessName?.trim() || null);
  const [launchMode, setLaunchMode] = useState(false);
  const shouldReadLaunchSession = mode === 'launch' || shell === 'launch';

  useEffect(() => {
    const nextLaunchMode = shouldReadLaunchSession ? readLaunchMode() : false;
    setLaunchMode(nextLaunchMode);
    setLastBusinessName(
      businessName?.trim() ||
      (mode === 'launch' && (nextLaunchMode || shell === 'fullscreen') ? readLastBusinessName() : null)
    );
  }, [businessName, mode, shell, shouldReadLaunchSession]);

  const fullscreen = shell === 'fullscreen' || (shell === 'launch' && launchMode);
  const useLaunchCopy = mode === 'launch' && (launchMode || shell === 'fullscreen');
  const cleanBusinessName = (businessName?.trim() || lastBusinessName?.trim()) ?? '';
  const loadingMessage =
    message ?? (useLaunchCopy ? (cleanBusinessName ? `Opening ${cleanBusinessName}...` : LAUNCH_MESSAGE) : INTERNAL_MESSAGE);
  const loadingDetail =
    detail ??
    (useLaunchCopy && cleanBusinessName
      ? "Getting today's sales, stock, and cash ready."
      : useLaunchCopy
        ? LAUNCH_DETAIL
        : INTERNAL_DETAIL);

  return (
    <div
      className={
        fullscreen
          ? 'fixed inset-0 z-[9999] flex h-screen min-h-dvh w-screen items-center justify-center bg-[#F8FBFF] px-5 py-10 text-ink [padding-bottom:max(2.5rem,env(safe-area-inset-bottom))] [padding-left:max(1.25rem,env(safe-area-inset-left))] [padding-right:max(1.25rem,env(safe-area-inset-right))] [padding-top:max(2.5rem,env(safe-area-inset-top))]'
          : 'flex min-h-[60vh] w-full items-center justify-center px-3 py-10 text-ink'
      }
    >
      <div className="w-full max-w-sm text-center" role="status" aria-live="polite">
        <div className="flex justify-center">
          <Logo variant="lockup" size={42} />
        </div>
        <p className="mt-6 text-sm font-semibold text-slate-700">{loadingMessage}</p>
        <p className="mt-1 text-xs text-slate-500">{loadingDetail}</p>

        {showProgress ? (
          <div className="mx-auto mt-6 h-1 w-40 overflow-hidden rounded-full bg-blue-100" aria-hidden="true">
            <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-blue-700 via-blue-400 to-blue-700 bg-[length:200%_100%] animate-shimmer motion-reduce:animate-none" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
