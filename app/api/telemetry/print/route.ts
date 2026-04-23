import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth';
import { appLog } from '@/lib/observability';

export const dynamic = 'force-dynamic';

const PrintEventSchema = z.object({
  kind: z.enum(['receipt', 'label']),
  mode: z.string().min(1).max(32),
  success: z.boolean(),
  error: z.string().max(300).optional(),
  printerName: z.string().max(120).nullable().optional(),
  durationMs: z.number().int().nonnegative().max(120000).optional(),
});

/**
 * Client-side ping after a receipt or label print attempt. Fire-and-forget —
 * if this fails the UI does not retry and the user is not blocked.
 *
 * No DB writes: the event lands in the structured log (info / warn) so ops
 * can grep by mode, printer, error message, or business.
 */
export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const parsed = PrintEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  const { kind, mode, success, error, printerName, durationMs } = parsed.data;
  const level = success ? 'info' : 'warn';
  const message = success ? `print.${kind}.success` : `print.${kind}.failure`;

  appLog(level, message, {
    businessId: user.businessId,
    userRole: user.role,
    kind,
    mode,
    success,
    error: error ?? null,
    printerName: printerName ?? null,
    durationMs: durationMs ?? null,
  });

  return new NextResponse(null, { status: 204 });
}
