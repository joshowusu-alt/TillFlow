import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const serverStart = Date.now();

export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user || !['MANAGER', 'OWNER'].includes(user.role)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const businessId = user.businessId;
  const now = new Date();
  const last24h = new Date(now.getTime() - 86400000);

  try {
    const [
      syncBacklog,
      lastSyncEvent,
      errorAuditLogs,
      scheduledJobs,
      messageLogs,
      dayClosures,
      riskAlerts,
    ] = await Promise.all([
      // Estimate sync backlog: SyncEvent records in last 24h
      prisma.syncEvent.count({ where: { businessId, appliedAt: { gte: last24h } } }),
      // Last sync event
      prisma.syncEvent.findFirst({
        where: { businessId },
        orderBy: { appliedAt: 'desc' },
        select: { appliedAt: true, eventType: true },
      }),
      // Audit log errors/warnings
      prisma.auditLog.count({
        where: {
          businessId,
          createdAt: { gte: last24h },
          action: { in: ['ERROR', 'FRAUD_ALERT', 'RISK_ALERT', 'VOID', 'RETURN'] },
        },
      }),
      // Last 5 scheduled jobs
      prisma.scheduledJob.findMany({
        where: { businessId },
        orderBy: { startedAt: 'desc' },
        take: 5,
        select: { jobName: true, status: true, startedAt: true, durationMs: true, errorMessage: true },
      }),
      // Message logs last 24h
      prisma.messageLog.count({ where: { businessId, sentAt: { gte: last24h } } }),
      // Last backup (day closure)
      prisma.dayClosure.findFirst({
        where: { businessId },
        orderBy: { closureDate: 'desc' },
        select: { closureDate: true, createdAt: true },
      }),
      // Open risk alerts
      prisma.riskAlert.count({ where: { businessId, status: 'OPEN' } }),
    ]);

    // DB health
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      status: 'ok',
      timestamp: now.toISOString(),
      uptimeSeconds: Math.floor((Date.now() - serverStart) / 1000),
      db: 'ok',
      metrics: {
        syncEvents24h: syncBacklog,
        lastSyncAt: lastSyncEvent?.appliedAt?.toISOString() ?? null,
        lastSyncType: lastSyncEvent?.eventType ?? null,
        auditErrors24h: errorAuditLogs,
        messagesSent24h: messageLogs,
        openRiskAlerts: riskAlerts,
        lastBackupDate: dayClosures?.closureDate?.toISOString() ?? null,
        lastBackupCreatedAt: dayClosures?.createdAt?.toISOString() ?? null,
      },
      scheduledJobs,
    });
  } catch (err) {
    return NextResponse.json(
      { status: 'degraded', error: String(err), timestamp: now.toISOString() },
      { status: 503 }
    );
  }
}
