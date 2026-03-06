import { NextRequest, NextResponse } from 'next/server';
import { resetPurchaseData } from '@/app/actions/reset-purchase-data';

export const maxDuration = 30;

export async function POST(_req: NextRequest) {
  try {
    const result = await resetPurchaseData();
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
