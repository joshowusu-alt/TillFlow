import { NextRequest, NextResponse } from 'next/server';
import { importStockAction, type ConfirmedImportRow } from '@/app/actions/import-stock';

// Generous timeout for bulk imports — 1500+ products with inventory upserts.
// vercel.json also sets maxDuration: 300 for this route.
// Vercel Hobby caps at 60 s; Pro allows up to 300 s.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const rows = (await req.json()) as ConfirmedImportRow[];
    // importStockAction already has an outermost try/catch so it always returns
    // an ActionResult — it never throws.
    const result = await importStockAction(rows);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
