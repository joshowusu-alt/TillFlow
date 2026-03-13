import { readFile } from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const scriptPath = path.join(process.cwd(), 'node_modules', 'qz-tray', 'qz-tray.js');
    const script = await readFile(scriptPath, 'utf8');

    return new NextResponse(script, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=3600',
        'Content-Type': 'application/javascript; charset=utf-8'
      }
    });
  } catch (error) {
    console.error('[qz] unable to serve local helper script:', error);
    return new NextResponse('QZ helper script is not available.', {
      status: 503,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8'
      }
    });
  }
}
