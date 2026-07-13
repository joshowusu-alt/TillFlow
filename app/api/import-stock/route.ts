import { NextRequest, NextResponse } from 'next/server';
import {
  importStockAction,
  type ConfirmedImportRow,
  type ImportStockMeta,
} from '@/app/actions/import-stock';

export const maxDuration = 300;

type ImportStockBody = {
  rows: ConfirmedImportRow[];
  meta?: ImportStockMeta;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ImportStockBody | ConfirmedImportRow[];
    const rows = Array.isArray(body) ? body : body.rows;
    const meta = Array.isArray(body) ? undefined : body.meta;
    if (!meta?.importMode) {
      return NextResponse.json(
        {
          success: false,
          error: 'Choose an import purpose first: Product catalogue, Opening stock, or Purchases.',
        },
        { status: 400 }
      );
    }
    const result = await importStockAction(rows, meta);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
