import { NextResponse } from 'next/server';
import { isRedirectError } from 'next/dist/client/components/redirect';
import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

type StatusFilter = 'all' | 'published' | 'hidden';

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  try {
    const { business } = await requireBusiness(['MANAGER', 'OWNER']);
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const q = url.searchParams.get('q')?.trim() ?? '';
    const status = (url.searchParams.get('status') ?? 'all') as StatusFilter;
    const page = parsePositiveInt(url.searchParams.get('page'), 1);
    const limit = Math.min(parsePositiveInt(url.searchParams.get('limit'), 50), 100);

    const where = {
      businessId: business.id,
      active: true,
      ...(status === 'published'
        ? { storefrontPublished: true }
        : status === 'hidden'
          ? { storefrontPublished: false }
          : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { category: { name: { contains: q, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          imageUrl: true,
          storefrontPublished: true,
          sellingPriceBasePence: true,
          category: { select: { name: true } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    return NextResponse.json({
      products,
      total,
      page,
      limit,
      hasMore: page * limit < total,
    });
  } catch (error) {
    if (isRedirectError(error)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('[storefront-catalogue] failed:', error);
    return NextResponse.json(
      { error: 'Could not load storefront catalogue products right now.' },
      { status: 500 },
    );
  }
}
