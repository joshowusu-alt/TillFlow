import type { NextPageContext } from 'next';

type ErrorPageProps = {
  statusCode?: number;
};

export default function ErrorPage({ statusCode }: ErrorPageProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-center">
      <div>
        <div className="text-sm font-semibold uppercase tracking-[0.24em] text-black/45">TillFlow</div>
        <h1 className="mt-3 text-3xl font-bold text-ink">Something went wrong</h1>
        <p className="mt-2 text-sm text-black/60">
          {statusCode ? `Error ${statusCode}` : 'An unexpected error occurred.'}
        </p>
      </div>
    </main>
  );
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res?.statusCode ?? err?.statusCode ?? 500;
  return { statusCode };
};
