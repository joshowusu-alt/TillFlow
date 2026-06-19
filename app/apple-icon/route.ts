import { readFile } from 'fs/promises';
import { join } from 'path';

export const runtime = 'nodejs';

export async function GET() {
  const file = await readFile(join(process.cwd(), 'public', 'apple-touch-icon.png'));
  return new Response(new Uint8Array(file), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
