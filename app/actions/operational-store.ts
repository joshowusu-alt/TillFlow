'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { withBusinessContext, safeAction, err, type ActionResult } from '@/lib/action-utils';
import { prisma } from '@/lib/prisma';
import {
  ALL_BRANCHES_NOT_OPERATIONAL_MSG,
  FOREIGN_OPERATIONAL_STORE_MSG,
  OPERATIONAL_STORE_COOKIE,
  isOperationalRoute,
  withOperationalStoreQuery,
} from '@/lib/reliability/operational-store';
import { operationalStoreCookieOptions } from '@/lib/reliability/operational-store-cookie';

/**
 * Switch the active branch. Resolves with an error result (never throws for
 * business/validation failures) so the header switcher can keep its
 * "Switching to…" dialog up, show the reason and offer Retry with the intended
 * branch intact. On success the action redirects.
 */
export async function switchOperationalStoreResultAction(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
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
}

/** Form-action variant (progressive enhancement / no-JS): failures surface as a thrown error. */
export async function switchOperationalStoreAction(formData: FormData): Promise<void> {
  const result = await switchOperationalStoreResultAction(formData);
  if (!result.success) throw new Error(result.error);
}

export async function switchOperationalStore(storeId: string, returnTo: string) {
  const form = new FormData();
  form.set('storeId', storeId);
  form.set('returnTo', returnTo);
  return switchOperationalStoreAction(form);
}
