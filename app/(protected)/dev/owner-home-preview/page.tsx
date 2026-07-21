import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';

/**
 * Development-only Home visual QA harness.
 * Middleware also blocks /dev/* outside development; this page-level guard is defence in depth.
 * Outside development this route always 404s — never redirects into the app with fixtures.
 */
function isOwnerHomePreviewAllowed(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.ALLOW_OWNER_HOME_PREVIEW === 'true'
  );
}

export default async function OwnerHomePreviewPage({
  searchParams,
}: {
  searchParams?: { fixture?: string };
}) {
  if (!isOwnerHomePreviewAllowed()) {
    notFound();
  }

  // Dynamic import keeps fixture modules off the production evaluation path.
  const [{ default: OwnerHomePreviewClient }, { HOME_PREVIEW_FIXTURES }] = await Promise.all([
    import('./OwnerHomePreviewClient'),
    import('./fixtures'),
  ]);

  const user = await requireUser();
  if (user.role !== 'OWNER') {
    redirect('/pos');
  }

  const key = (searchParams?.fixture ?? 'established-issues') as keyof typeof HOME_PREVIEW_FIXTURES;
  const fixture = HOME_PREVIEW_FIXTURES[key] ?? HOME_PREVIEW_FIXTURES['established-issues'];

  return (
    <div>
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-[11px] font-semibold text-amber-900">
        Local Home preview · fixture: {key in HOME_PREVIEW_FIXTURES ? String(key) : 'established-issues'} · not for production
      </div>
      <OwnerHomePreviewClient readiness={fixture} />
    </div>
  );
}
