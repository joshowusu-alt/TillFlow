import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { resolveSelectableReportDateRange } from '@/lib/reports/date-parsing';

export const csvEscape = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

export const formatPence = (pence: number) => (pence / 100).toFixed(2);

export async function requireExportUser(request: Request) {
  const user = await getUser();
  if (!user || !['MANAGER', 'OWNER'].includes(user.role)) {
    return { user: null, response: NextResponse.redirect(new URL('/login', request.url)) };
  }
  return { user, response: null };
}

export function resolveExportDateRange(request: Request, defaultPeriod = '30d') {
  const { searchParams } = new URL(request.url);

  return resolveSelectableReportDateRange(
    {
      period: searchParams.get('period') ?? undefined,
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
    },
    defaultPeriod,
  );
}
