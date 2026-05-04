import { NextRequest, NextResponse } from 'next/server';
import { getStorefrontCatalogPage } from '@/lib/services/online-orders';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug') ?? '';
  const page = await getStorefrontCatalogPage(slug, {
    search: searchParams.get('q'),
    categoryId: searchParams.get('category'),
    offset: Number(searchParams.get('offset') ?? 0),
    limit: Number(searchParams.get('limit') ?? 48),
  });

  if (!page) {
    return NextResponse.json({ error: 'Storefront not found' }, { status: 404 });
  }

  return NextResponse.json(page, {
    headers: {
      'Cache-Control': 'private, max-age=20, stale-while-revalidate=60',
    },
  });
}
