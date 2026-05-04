import { NextRequest, NextResponse } from 'next/server';
import { getStorefrontSessionCustomer } from '@/lib/services/storefront-customers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug') ?? '';
  if (!slug) {
    return NextResponse.json({ customer: null }, { status: 200 });
  }

  const customer = await getStorefrontSessionCustomer(slug);
  return NextResponse.json({
    customer: customer
      ? { id: customer.id, phone: customer.phone, name: customer.name, email: customer.email }
      : null,
  });
}
