import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? '20'), 50);

    const where: Prisma.CustomerWhereInput = { businessId: user.businessId };

    if (q.length > 0) {
        // mode:'insensitive' maps to ILIKE on Postgres and is silently ignored
        // by SQLite (whose contains is already case-insensitive). Same pattern
        // as the rest of the app's name searches — keeps POS/storefront parity.
        where.OR = [
            { name: { contains: q, mode: 'insensitive' } } as any,
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

