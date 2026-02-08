import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';

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
