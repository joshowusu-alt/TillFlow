import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function previewOnly() {
  if (process.env.VERCEL_ENV === 'production') return false;
  return (
    process.env.VERCEL_ENV === 'preview' ||
    process.env.RELIABILITY_EVIDENCE_API === '1' ||
    process.env.NODE_ENV !== 'production'
  );
}

/**
 * Public Preview/local deploy identity. Never enabled on Vercel Production.
 * No tenant data, credentials, or PII.
 */
export async function GET() {
  if (!previewOnly()) {
    return NextResponse.json({ error: 'not_available' }, { status: 404 });
  }

  return NextResponse.json({
    sha: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
  });
}
