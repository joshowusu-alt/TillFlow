import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireBusinessAndOptionalStore } from '@/lib/auth';
import { ingredientOptions } from '@/lib/food/ingredient-options';
import DishForm from '@/components/food/DishForm';
import PreparePortionsForm from '@/components/food/PreparePortionsForm';
import LeftoverWriteOffForm from '@/components/food/LeftoverWriteOffForm';
import { isFoodBusiness } from '@/lib/food/business';
import type { DishDraft } from '@/lib/food/dish-draft';
import { prisma } from '@/lib/prisma';
import { formatMoney } from '@/lib/format';

function cedisInput(pence: number) {
  return (pence / 100).toFixed(2);
}

export default async function DishPage(props: { params: Promise<{ productId: string }> }) {
  const { productId } = await props.params;
  const { business, store: branch } = await requireBusinessAndOptionalStore(['MANAGER', 'OWNER']);
  if (!business || !isFoodBusiness(business.businessCategory)) redirect('/products');

  const dish = await prisma.foodDish.findFirst({
    where: { productId, businessId: business.id },
    include: {
      product: { select: { name: true, sellingPriceBasePence: true, defaultCostBasePence: true, storefrontDescription: true, storefrontPublished: true } },
      sizes: { orderBy: { sortOrder: 'asc' } },
      inclusions: { orderBy: { sortOrder: 'asc' } },
      groups: { orderBy: { sortOrder: 'asc' }, include: { addons: { orderBy: { sortOrder: 'asc' } } } },
    },
  });
  if (!dish) notFound();

  const latestCost = branch ? await prisma.foodPreparation.findFirst({
    where: { businessId: business.id, storeId: branch.id, productId, costPerPortionPence: { not: null } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { costPerPortionPence: true },
  }) : null;
  const draft: DishDraft = {
    productId: dish.productId,
    name: dish.product.name,
    startingPriceCedis: cedisInput(dish.product.sellingPriceBasePence),
    estimatedCostCedis: dish.product.defaultCostBasePence > 0 ? cedisInput(dish.product.defaultCostBasePence) : '',
    description: dish.product.storefrontDescription ?? '',
    showOnline: dish.product.storefrontPublished,
    stockMode: dish.stockMode === 'COUNTED' ? 'COUNTED' : 'NOT_COUNTED',
    soldOut: dish.soldOut,
    lowAt: dish.lowAt,
    recipe: JSON.parse(dish.recipeJson ?? '[]'),
    sizes: dish.sizes.map((size) => ({ recipe: JSON.parse(size.recipeJson ?? '[]'), name: size.name, priceCedis: cedisInput(size.pricePence), isDefault: size.isDefault })),
    inclusions: dish.inclusions.map((item) => ({ name: item.name, qty: item.qty, counts: item.stockPortions > 0 })),
    groups: dish.groups.map((group) => ({
      name: group.name,
      selection: group.selection === 'SINGLE' ? 'SINGLE' : 'MANY',
      required: group.required,
      addons: group.addons.map((addon) => ({
        name: addon.name,
        priceCedis: cedisInput(addon.pricePence),
        maxQty: addon.maxQty,
        stockPortions: addon.stockPortions,
      })),
    })),
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{dish.product.name}</h1>
          <p className="mt-1 text-sm text-black/60">
            Starting price {formatMoney(dish.product.sellingPriceBasePence, business.currency)}.
            {dish.stockMode === 'COUNTED' ? ' Portions are counted.' : dish.soldOut ? ' Marked sold out.' : ' Available, and not counted.'}
          </p>
        </div>
        <Link href="/pos" className="btn-secondary text-sm">Try at the till</Link>
      </div>
      {dish.stockMode === 'COUNTED' && branch ? (
        <>
          <PreparePortionsForm productId={dish.productId} storeId={branch.id} currency={business.currency} sizes={dish.sizes.map(({ id, name, isDefault }) => ({ id, name, isDefault }))} />
          <LeftoverWriteOffForm productId={dish.productId} storeId={branch.id} costPerPortionPence={latestCost?.costPerPortionPence ?? null} currency={business.currency} />
        </>
      ) : null}
      <DishForm ingredients={await ingredientOptions(business.id)} initial={draft} productId={dish.productId} />
    </div>
  );
}
