import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const startedAt = Date.now();

export async function GET() {
  const now = Date.now();
  const checks: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor((now - startedAt) / 1000),
    env: {
      hasPostgresUrl: !!process.env.POSTGRES_PRISMA_URL,
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      nodeEnv: process.env.NODE_ENV,
    },
  };

  try {
    const result = await prisma.$queryRaw<[{ ok: number }]>`SELECT 1 as ok`;
    checks.db = 'ok';
    checks.dbResult = result[0]?.ok;
  } catch (err: any) {
    checks.db = 'down';
    checks.dbError = err.message?.slice(0, 300);
  }

  try {
    const userCount = await prisma.user.count();
    const businessCount = await prisma.business.count();
    checks.data = { users: userCount, businesses: businessCount };
  } catch (err: any) {
    checks.dataError = err.message?.slice(0, 300);
  }

  const ok = checks.db === 'ok';
  checks.status = ok ? 'ok' : 'degraded';

  return NextResponse.json(checks, { status: ok ? 200 : 503 });
}
