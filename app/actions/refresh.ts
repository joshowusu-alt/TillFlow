'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requireBusiness } from '@/lib/auth';

function normalizePathname(pathname: string | null | undefined) {
  if (!pathname || !pathname.startsWith('/') || pathname.startsWith('//')) return null;
  if (pathname.includes('\0')) return null;
  return pathname;
}

export async function refreshCurrentView(pathname?: string) {
  const { business } = await requireBusiness();

  [
    'reports',
    'pos-categories',
    'pos-customers',
    'pos-inventory',
    'pos-products',
    'pos-shifts',
    'pos-tills',
    'pos-units',
    `readiness-${business.id}`,
    `today-sales-${business.id}`,
  ].forEach((tag) => revalidateTag(tag));

  revalidatePath('/', 'layout');

  const safePathname = normalizePathname(pathname);
  if (safePathname) {
    revalidatePath(safePathname);
  }

  return { ok: true, refreshedAt: new Date().toISOString() };
}
