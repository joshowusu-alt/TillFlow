import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { formatPence, requireExportUser } from '../_shared';

function parseDate(value: string | null, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed;
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildSimplePdf(lines: string[]) {
  const textStream = ['BT', '/F1 10 Tf', '50 780 Td'];
  lines.forEach((line, index) => {
    if (index === 0) {
      textStream.push(`(${escapePdfText(line)}) Tj`);
    } else {
      textStream.push(`0 -14 Td (${escapePdfText(line)}) Tj`);
    }
  });
  textStream.push('ET');
  const stream = textStream.join('\n');

  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${Buffer.byteLength(stream, 'utf8')} >> stream\n${stream}\nendstream endobj`,
  ];

  let body = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body, 'utf8'));
    body += `${obj}\n`;
  }

  const xrefOffset = Buffer.byteLength(body, 'utf8');
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(body, 'utf8');
}

export async function GET(request: Request) {
  const { user, response } = await requireExportUser(request);
  if (!user) return response as NextResponse;

  const url = new URL(request.url);
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);

  const from = parseDate(url.searchParams.get('from'), weekAgo);
  const to = parseDate(url.searchParams.get('to'), today);
  to.setHours(23, 59, 59, 999);

  const [business, shifts] = await Promise.all([
    prisma.business.findUnique({
      where: { id: user.businessId },
      select: { name: true, currency: true },
    }),
    prisma.shift.findMany({
      where: {
        till: { store: { businessId: user.businessId } },
        openedAt: { gte: from, lte: to },
      },
      orderBy: { openedAt: 'desc' },
      select: {
        openedAt: true,
        expectedCashPence: true,
        actualCashPence: true,
        variance: true,
        till: { select: { name: true, store: { select: { name: true } } } },
        user: { select: { name: true } },
      },
      take: 40,
    }),
  ]);

  const lines = [
    `${business?.name ?? 'Business'} Cash Drawer Summary`,
    `Range: ${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`,
    'Date | Branch | Till | Cashier | Expected | Counted | Variance',
    ...shifts.map((shift) => {
      const counted = shift.actualCashPence ?? 0;
      const variance = shift.variance ?? counted - shift.expectedCashPence;
      return [
        shift.openedAt.toISOString().slice(0, 10),
        shift.till.store.name,
        shift.till.name,
        shift.user.name,
        formatPence(shift.expectedCashPence),
        formatPence(counted),
        formatPence(variance),
      ].join(' | ');
    }),
  ];

  const pdf = buildSimplePdf(lines);
  return new NextResponse(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="cash-drawer-summary.pdf"',
    },
  });
}
