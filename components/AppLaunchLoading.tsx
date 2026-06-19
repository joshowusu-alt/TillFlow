import { Logo } from './Logo';

type AppLaunchLoadingProps = {
  message?: string;
  shell?: 'fullscreen' | 'content';
  showSkeleton?: boolean;
};

export default function AppLaunchLoading({
  message = 'Loading your business...',
  shell = 'fullscreen',
  showSkeleton = true,
}: AppLaunchLoadingProps) {
  const fullscreen = shell === 'fullscreen';

  return (
    <div
      className={
        fullscreen
          ? 'flex min-h-dvh w-full items-center justify-center bg-[#F8FBFF] px-5 py-10 text-ink'
          : 'flex min-h-[60vh] w-full items-center justify-center px-3 py-10 text-ink'
      }
    >
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl border border-blue-100 bg-white shadow-card">
          <Logo variant="mark" size={56} ariaHidden />
        </div>
        <div className="mt-5 flex justify-center">
          <Logo variant="lockup" size={30} />
        </div>
        <p className="mt-4 text-sm font-semibold text-slate-700">{message}</p>
        <p className="mt-1 text-xs text-slate-500">TillFlow is getting your workspace ready.</p>

        {showSkeleton ? (
          <div className="mx-auto mt-7 max-w-xs space-y-3" aria-hidden="true">
            <div className="h-3 rounded-full bg-gradient-to-r from-blue-100 via-white to-blue-100 bg-[length:200%_100%] animate-shimmer" />
            <div className="grid grid-cols-3 gap-2">
              <div className="h-12 rounded-2xl bg-white shadow-sm ring-1 ring-blue-100/80" />
              <div className="h-12 rounded-2xl bg-white shadow-sm ring-1 ring-blue-100/80" />
              <div className="h-12 rounded-2xl bg-white shadow-sm ring-1 ring-blue-100/80" />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
