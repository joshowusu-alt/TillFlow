'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { withBusinessContext, safeAction, err } from '@/lib/action-utils';
import { prisma } from '@/lib/prisma';
import {
  ALL_BRANCHES_NOT_OPERATIONAL_MSG,
  FOREIGN_OPERATIONAL_STORE_MSG,
  OPERATIONAL_STORE_COOKIE,
  isOperationalRoute,
  withOperationalStoreQuery,
} from '@/lib/reliability/operational-store';
import { operationalStoreCookieOptions } from '@/lib/reliability/operational-store-cookie';

export async function switchOperationalStoreAction(formData: FormData): Promise<void> {
  const result = await safeAction(async () => {
    const { businessId, user } = await withBusinessContext(undefined, { requireWrite: false });
    if (user.role !== 'OWNER' && user.role !== 'MANAGER') {
      return err('Only an owner or manager can switch the active branch.');
    }

    const storeId = String(formData.get('storeId') ?? '').trim();
    const returnTo = String(formData.get('returnTo') ?? '').trim() || '/onboarding';
    if (!storeId) return err('Select a branch first.');
    if (storeId === 'ALL') return err(ALL_BRANCHES_NOT_OPERATIONAL_MSG);

    const store = await prisma.store.findFirst({
      where: { id: storeId, businessId },
      select: { id: true },
    });
    if (!store) return err(FOREIGN_OPERATIONAL_STORE_MSG);

    cookies().set(OPERATIONAL_STORE_COOKIE, store.id, operationalStoreCookieOptions());
    revalidatePath('/', 'layout');

    const nextPath = isOperationalRoute(returnTo.split('?')[0] ?? '')
      ? withOperationalStoreQuery(returnTo, store.id)
      : returnTo.split('?')[0] || returnTo;
    redirect(nextPath);
  });
  if (!result.success) throw new Error(result.error);
}

export async function switchOperationalStore(storeId: string, returnTo: string) {
  const form = new FormData();
  form.set('storeId', storeId);
  form.set('returnTo', returnTo);
  return switchOperationalStoreAction(form);
}
