import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const startedAt = Date.now();

export async function GET() {
  const now = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor((now - startedAt) / 1000),
        db: 'ok'
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor((now - startedAt) / 1000),
        db: 'down'
      },
      { status: 503 }
    );
  }
}
