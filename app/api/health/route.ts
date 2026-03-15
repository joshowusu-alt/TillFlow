import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import packageJson from '@/package.json';

export const dynamic = 'force-dynamic';

type HealthServiceStatus = 'up' | 'down' | 'not_configured';

type HealthService = {
  status: HealthServiceStatus;
  latency_ms?: number;
  error?: string;
};

function getLatencyMs(startTime: number) {
  return Math.max(Math.round(performance.now() - startTime), 0);
}

async function checkDatabase(): Promise<HealthService> {
  const startTime = performance.now();

  try {
    await prisma.$queryRaw<[{ ok: number }]>`SELECT 1 as ok`;
    return {
      status: 'up',
      latency_ms: getLatencyMs(startTime),
    };
  } catch (err: any) {
    console.error('[health] DB check failed:', err?.message);
    return {
      status: 'down',
      latency_ms: getLatencyMs(startTime),
      error: err?.message ?? 'Database connectivity check failed.',
    };
  }
}

async function checkRedis(): Promise<HealthService> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  if (!redisUrl) {
    return { status: 'not_configured' };
  }

  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!redisToken) {
    console.error('[health] Redis URL is configured but token is missing.');
    return {
      status: 'down',
      error: 'Redis token is missing.',
    };
  }

  const startTime = performance.now();

  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({ url: redisUrl, token: redisToken });
    await redis.ping();

    return {
      status: 'up',
      latency_ms: getLatencyMs(startTime),
    };
  } catch (err: any) {
    console.error('[health] Redis check failed:', err?.message);
    return {
      status: 'down',
      latency_ms: getLatencyMs(startTime),
      error: err?.message ?? 'Redis connectivity check failed.',
    };
  }
}

export async function GET() {
  const [database, redis] = await Promise.all([
    checkDatabase(),
    checkRedis(),
  ]);

  try {
    const userCount = await prisma.user.count();
    const businessCount = await prisma.business.count();
    console.log(`[health] users=${userCount} businesses=${businessCount}`);
  } catch (err: any) {
    console.error('[health] Data count failed:', err?.message);
  }

  const services = { database, redis };
  const databaseDown = database.status === 'down';
  const degraded = Object.values(services).some((service) => service.status === 'down');

  const status = databaseDown
    ? 'unhealthy'
    : degraded
      ? 'degraded'
      : 'healthy';

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      services,
      version: packageJson.version,
    },
    { status: databaseDown ? 503 : 200 }
  );
}
