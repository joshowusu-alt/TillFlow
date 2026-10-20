'use server';

import { revalidatePath } from 'next/cache';
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
