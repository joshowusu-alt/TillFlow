import { prisma } from '@/lib/prisma';

export async function ingredientOptions(businessId: string) {
  const products = await prisma.product.findMany({
    where: { businessId, active: true, foodDish: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, productUnits: {
      where: { isBaseUnit: true }, select: { unit: { select: { name: true } } },
    } },
  });
  return products.map(product => ({ id: product.id, name: product.name, unit: product.productUnits[0]?.unit.name ?? 'stock unit' }));
}
