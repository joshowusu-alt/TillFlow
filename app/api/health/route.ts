import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  let dbOk = false;

  try {
    await prisma.$queryRaw<[{ ok: number }]>`SELECT 1 as ok`;
    dbOk = true;
  } catch (err: any) {
    console.error('[health] DB check failed:', err?.message);
  }

  try {
    const userCount = await prisma.user.count();
    const businessCount = await prisma.business.count();
    console.log(`[health] users=${userCount} businesses=${businessCount}`);
  } catch (err: any) {
    console.error('[health] Data count failed:', err?.message);
  }

  return NextResponse.json(
    { status: dbOk ? 'ok' : 'error' },
    { status: dbOk ? 200 : 503 }
  );
}
