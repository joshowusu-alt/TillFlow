import { NextRequest, NextResponse } from 'next/server';
import { importStockAction, type ConfirmedImportRow } from '@/app/actions/import-stock';

// Explicit 60-second timeout — set in vercel.json under "app/api/import-stock/**"
// so Vercel enforces it regardless of account plan defaults.
export const maxDuration = 60;

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
