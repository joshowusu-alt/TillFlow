import { isFoodBusiness } from '@/lib/food/business';
import type { Ingredient } from '@/lib/food/ingredient-costs';
import { prisma } from '@/lib/prisma';

export async function findSaleableRecipeIngredients(businessId: string, productId: string) {
  const dish = await prisma.foodDish.findFirst({
    where: { businessId, productId },
    select: { recipeJson: true, sizes: { select: { recipeJson: true } } },
  });
  if (!dish) throw new Error('Dish not found.');
  const ids = [dish, ...dish.sizes].flatMap(({ recipeJson }) =>
    (JSON.parse(recipeJson ?? '[]') as Ingredient[]).map(({ productId }) => productId),
  );
  return prisma.product.findMany({
    where: { businessId, id: { in: ids }, active: true, ingredientOnly: false, foodDish: null },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

export async function markRecipeIngredientsNotSold(businessId: string, productId: string) {
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { businessCategory: true, storefrontSlug: true },
  });
  if (!isFoodBusiness(business.businessCategory)) throw new Error('This action is for food businesses.');
  const ingredients = await findSaleableRecipeIngredients(businessId, productId);
  const result = await prisma.product.updateMany({
    where: {
      businessId,
      id: { in: ingredients.map(({ id }) => id) },
      active: true,
      ingredientOnly: false,
      foodDish: null,
    },
    data: { ingredientOnly: true },
  });
  return { count: result.count, storefrontSlug: business.storefrontSlug };
}
