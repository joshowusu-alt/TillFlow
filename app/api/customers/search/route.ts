import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

const isPostgres = process.env.POSTGRES_PRISMA_URL !== undefined;

export async function GET(request: NextRequest) {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? '20'), 50);

    const where: Prisma.CustomerWhereInput = { businessId: user.businessId };

    if (q.length > 0) {
        // mode:'insensitive' is only supported on PostgreSQL; omit on SQLite
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nameFilter: any = isPostgres
            ? { contains: q, mode: 'insensitive' }
            : { contains: q };
        where.OR = [
            { name: nameFilter },
            { phone: { contains: q } },
        ];
    }

    const customers = await prisma.customer.findMany({
        where,
        select: {
            id: true,
            name: true,
            phone: true,
            creditLimitPence: true,
        },
        orderBy: { name: 'asc' },
        take: limit,
    });

    return NextResponse.json({ customers });
}

