import { NextResponse } from 'next/server';

// Temporary endpoint — deploy, hit once, then delete this file
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.secret !== 'wipe-stale-2025') {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // Step 1: Test basic connectivity
    if (body.step === 'ping') {
      return NextResponse.json({ ok: true, message: 'pong' });
    }

    // Step 2: Try Prisma
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    try {
      // Step 3: Query tables
      const rows: { tablename: string }[] = await prisma.$queryRaw`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
          AND tablename NOT LIKE '_prisma%'
      `;
      const tables = rows.map((r) => r.tablename);

      if (body.step === 'list') {
        await prisma.$disconnect();
        return NextResponse.json({ ok: true, tables });
      }

      // Step 4: Truncate all
      if (tables.length > 0) {
        const quoted = tables.map((t) => `"${t}"`).join(', ');
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} CASCADE`);
      }

      await prisma.$disconnect();
      return NextResponse.json({ ok: true, message: `Truncated ${tables.length} tables.`, tables });
    } catch (dbErr: unknown) {
      await prisma.$disconnect();
      return NextResponse.json({ error: (dbErr as Error).message, stack: (dbErr as Error).stack?.split('\n').slice(0, 5) }, { status: 500 });
    }
  } catch (outerErr: unknown) {
    return NextResponse.json({ error: (outerErr as Error).message }, { status: 500 });
  }
}
