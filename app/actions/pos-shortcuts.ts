'use server';

import { prisma } from '@/lib/prisma';
import { requireSelectedStoreContext, safeAction, ok, UserError } from '@/lib/action-utils';
import { FOOD_BUSINESS_CATEGORY } from '@/lib/food/business';
import { parseShortcutLayout, readShortcutLayout } from '@/lib/pos/shortcuts';
import { audit } from '@/lib/audit';

export async function savePosShortcutsAction(storeId: string, expected: string | null, input: unknown) {
  return safeAction(async () => {
    const { businessId, user } = await requireSelectedStoreContext(['OWNER', 'MANAGER'], storeId);
    const layout = parseShortcutLayout(input);
    const ids = [...new Set(layout.screens.flatMap(screen => screen.productIds))];
    const count = await prisma.product.count({ where: { businessId, active: true, id: { in: ids } } });
    if (count !== ids.length) {
      const previous = new Set(readShortcutLayout(expected).screens.flatMap(screen => screen.productIds));
      const retainedRemovedDishes = ids.filter(id => previous.has(id));
      const removedCount = retainedRemovedDishes.length ? await prisma.product.count({
        where: {
          businessId, active: false, id: { in: retainedRemovedDishes }, foodDish: { isNot: null },
          business: { businessCategory: FOOD_BUSINESS_CATEGORY },
        },
      }) : 0;
      if (count + removedCount !== ids.length) throw new UserError('Some products are no longer available. Remove them before saving.');
    }
    const revision = JSON.stringify(layout);
    const updated = await prisma.store.updateMany({
      where: { id: storeId, businessId, posShortcutsJson: expected },
      data: { posShortcutsJson: revision },
    });
    if (!updated.count) throw new UserError('These shortcuts changed on another till. Reload the page before editing again.');
    await audit({ businessId, userId: user.id, userName: user.name, userRole: user.role,
      action: 'SETTINGS_UPDATE', entity: 'PosShortcuts', entityId: storeId,
      details: { screens: layout.screens.map(s => ({ name: s.name, products: s.productIds.length })) },
    });
    return ok({ layout, revision });
  });
}
