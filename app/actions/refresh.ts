'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requireBusinessAndOptionalStore } from '@/lib/auth';
import {
  checkoutContextTag,
  posCategoriesTag,
  posCustomersTag,
  revalidatePosCatalog,
  revalidatePosTillShiftTags,
} from '@/lib/cache/pos-tags';

function normalizePathname(pathname: string | null | undefined) {
  if (!pathname || !pathname.startsWith('/') || pathname.startsWith('//')) return null;
  if (pathname.includes('\0')) return null;
  return pathname;
}

export async function refreshCurrentView(pathname?: string) {
  const { business, store } = await requireBusinessAndOptionalStore();

  revalidatePosCatalog(business.id, store?.id);
  if (store) {
    revalidatePosTillShiftTags(business.id, store.id);
  }
  revalidateTag(posCategoriesTag(business.id));
  revalidateTag(posCustomersTag(business.id));
  revalidateTag(checkoutContextTag(business.id));
  revalidateTag('pos-units');
  revalidateTag('reports');
  revalidateTag(`readiness-${business.id}`);
  revalidateTag(`today-sales-${business.id}`);

  revalidatePath('/', 'layout');

  const safePathname = normalizePathname(pathname);
  if (safePathname) {
    revalidatePath(safePathname);
  }

  return { ok: true, refreshedAt: new Date().toISOString() };
}
