'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { quickCreateCategoryAction } from './categories';
import { withBusinessContext, safeAction, ok } from '@/lib/action-utils';
import { createClassificationNode } from '@/lib/services/product-classification';
import { audit } from '@/lib/audit';

export async function createClassificationNodeAction(kind: 'division' | 'group', parentId: string, name: string) {
  return safeAction(async () => {
    const { businessId, user } = await withBusinessContext(['OWNER', 'MANAGER']);
    if (kind !== 'division' && kind !== 'group') throw new Error('Choose a division or group.');
    const node = await createClassificationNode(businessId, kind, parentId, name);
    await audit({ businessId, userId: user.id, userName: user.name, userRole: user.role,
      action: 'CATEGORY_CREATE', entity: kind === 'division' ? 'ProductDivision' : 'ProductGroup',
      entityId: node.id, details: { name: node.name, parentId },
    });
    revalidatePath('/products');
    return ok(node);
  });
}

/** Keep the selected parent and next creation step through server revalidation. */
export async function saveClassificationSetupAction(kind: 'category' | 'division' | 'group', parentId: string, name: string): Promise<Awaited<ReturnType<typeof createClassificationNodeAction>>> {
  const { businessId } = await withBusinessContext(['OWNER', 'MANAGER']);
  const result = kind === 'category' ? await quickCreateCategoryAction(name) : await createClassificationNodeAction(kind, parentId, name);
  if (!result.success) return result;
  const params = new URLSearchParams({ tab: 'categories', setupSaved: kind });
  if (kind === 'category') {
    params.set('setupCategory', result.data.id); params.set('setupAdd', 'division');
  } else if (kind === 'division') {
    const node = await prisma.productDivision.findFirst({ where: { id: result.data.id, businessId }, select: { categoryId: true } });
    if (!node) redirect('/products?tab=categories');
    params.set('setupCategory', node.categoryId); params.set('setupDivision', result.data.id); params.set('setupAdd', 'group');
  } else {
    const node = await prisma.productGroup.findFirst({ where: { id: result.data.id, businessId, division: { businessId } }, select: { divisionId: true, division: { select: { categoryId: true } } } });
    if (!node) redirect('/products?tab=categories');
    params.set('setupCategory', node.division.categoryId); params.set('setupDivision', node.divisionId); params.set('setupGroup', result.data.id);
  }
  redirect(`/products?${params}`);
}
