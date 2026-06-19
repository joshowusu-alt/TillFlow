import { Logo } from './Logo';

type AppLaunchLoadingProps = {
  businessName?: string | null;
  message?: string;
  detail?: string;
  shell?: 'fullscreen' | 'content';
  showProgress?: boolean;
};

export default function AppLaunchLoading({
  businessName,
  message,
  detail,
  shell = 'fullscreen',
  showProgress = true,
}: AppLaunchLoadingProps) {
  const fullscreen = shell === 'fullscreen';
  const cleanBusinessName = businessName?.trim();
  const loadingMessage =
    message ?? (cleanBusinessName ? `Opening ${cleanBusinessName}...` : 'Opening your business workspace...');
  const loadingDetail =
    detail ??
    (cleanBusinessName
      ? "Getting today's sales, stock, and cash ready."
      : 'Getting sales, stock, and cash ready.');

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
