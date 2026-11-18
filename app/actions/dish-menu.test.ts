import { beforeEach, expect, it, vi } from 'vitest';

const { context, updateMany, findUnique } = vi.hoisted(() => ({
  context: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(),
}));
vi.mock('@/lib/action-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/action-utils')>();
  return { ...actual, withBusinessContext: context };
});
vi.mock('@/lib/prisma', () => ({ prisma: { product: { updateMany }, business: { findUnique } } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => {}) }));
vi.mock('@/lib/activation-snapshot', () => ({ persistActivationSnapshot: vi.fn(async () => {}) }));

import { setDishOnMenuAction } from './food';

beforeEach(() => {
  vi.clearAllMocks();
  context.mockResolvedValue({ businessId: 'kitchen', user: { id: 'owner', role: 'OWNER' } });
  updateMany.mockResolvedValue({ count: 1 });
  findUnique.mockResolvedValue(null);
});

it('changes only the active flag on a dish belonging to the owner’s food business', async () => {
  await expect(setDishOnMenuAction('fufu', false)).resolves.toMatchObject({ success: true });
  expect(context).toHaveBeenCalledWith(['OWNER']);
  expect(updateMany).toHaveBeenCalledWith({
    where: { id: 'fufu', businessId: 'kitchen', foodDish: { isNot: null }, business: { businessCategory: 'FOOD_DISHES' } },
    data: { active: false },
  });
  await expect(setDishOnMenuAction('fufu', true)).resolves.toMatchObject({ success: true });
  expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: { active: true } }));
});

it('refuses a dish outside that scope', async () => {
  updateMany.mockResolvedValue({ count: 0 });
  await expect(setDishOnMenuAction('other-dish', false)).resolves.toMatchObject({ success: false });
});

it('refuses a manager or cashier at the owner guard before writes', async () => {
  for (const role of ['MANAGER', 'CASHIER']) {
    context.mockImplementationOnce(async (roles: string[]) => {
      if (!roles.includes(role)) throw new Error('Forbidden');
      return { businessId: 'kitchen', user: { id: role, role } };
    });
    await expect(setDishOnMenuAction('fufu', false)).resolves.toMatchObject({ success: false });
  }
  expect(updateMany).not.toHaveBeenCalled();
});
