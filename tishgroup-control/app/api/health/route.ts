import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { isControlMaintenanceMode } from '@/lib/control-maintenance';

export const dynamic = 'force-dynamic';

export async function GET() {
  const identityPath = join(process.cwd(), 'public', 'build-identity.json');
  let sourceHash: string | null = null;
  let gitSha: string | null = process.env.VERCEL_GIT_COMMIT_SHA || null;
  if (existsSync(identityPath)) {
    try {
      const parsed = JSON.parse(readFileSync(identityPath, 'utf8')) as { sourceHash?: string; gitSha?: string | null };
      sourceHash = parsed.sourceHash ?? null;
      gitSha = parsed.gitSha ?? gitSha;
    } catch {
      sourceHash = null;
    }
  }

  return NextResponse.json({
    ok: true,
    maintenance: isControlMaintenanceMode(),
    vercelEnv: process.env.VERCEL_ENV ?? null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    gitSha,
    sourceHash,
  });
}
