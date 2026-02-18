import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

// Temporary endpoint — deploy, hit once, then delete this file
export const maxDuration = 30;

export async function POST(req: Request) {
  const { secret } = await req.json();
  if (secret !== 'wipe-stale-2025') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const prisma = new PrismaClient();

  try {
    // Query actual tables in the public schema
    const rows: { tablename: string }[] = await prisma.$queryRaw`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
        AND tablename NOT LIKE '_prisma%'
    `;
    const tables = rows.map((r) => r.tablename);

    if (tables.length === 0) {
      return NextResponse.json({ ok: true, message: 'No tables found.' });
    }

    // TRUNCATE all tables in a single statement with CASCADE
    const quoted = tables.map((t) => `"${t}"`).join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} CASCADE`);

    return NextResponse.json({ ok: true, message: `Truncated ${tables.length} tables.`, tables });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
