import type { Metadata } from 'next';
import LaunchRedirector from '@/components/LaunchRedirector';

export const metadata: Metadata = {
  title: 'TillFlow Launch',
};

export default function LaunchPage() {
  return (
    <main className="fixed inset-0 z-[9998] flex h-screen min-h-dvh w-screen items-center justify-center bg-[#F8FBFF] px-5 py-10 text-ink [padding-bottom:max(2.5rem,env(safe-area-inset-bottom))] [padding-left:max(1.25rem,env(safe-area-inset-left))] [padding-right:max(1.25rem,env(safe-area-inset-right))] [padding-top:max(2.5rem,env(safe-area-inset-top))]">
      <div className="w-full max-w-sm text-center" role="status" aria-live="polite">
        <div className="flex justify-center">
          <img
            src="/brand/tillflow-logo-blue.png"
            alt="TillFlow"
            width={180}
            height={51}
            className="block h-auto w-[180px]"
            draggable={false}
          />
        </div>
        <LaunchRedirector />
        <div className="mx-auto mt-6 h-1 w-40 overflow-hidden rounded-full bg-blue-100" aria-hidden="true">
          <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-blue-700 via-blue-400 to-blue-700 bg-[length:200%_100%] animate-shimmer motion-reduce:animate-none" />
        </div>
      </div>
    </main>
  );
}
