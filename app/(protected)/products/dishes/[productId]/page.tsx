import FoodRecordHistory from '@/components/food/FoodRecordHistory';
import { loadFoodRecordHistory } from '@/lib/food/record-history';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireBusinessAndOptionalStore } from '@/lib/auth';
import { ingredientOptions } from '@/lib/food/ingredient-options';
import DishForm from '@/components/food/DishForm';
import PreparePortionsForm from '@/components/food/PreparePortionsForm';
import LeftoverWriteOffForm from '@/components/food/LeftoverWriteOffForm';
import { isFoodBusiness } from '@/lib/food/business';
import { inventoryAvailability } from '@/lib/food/inventory-presentation';
import type { DishDraft } from '@/lib/food/dish-draft';
import { prisma } from '@/lib/prisma';
import { formatMoney } from '@/lib/format';

function cedisInput(pence: number) {
  return (pence / 100).toFixed(2);
}

export default async function DishPage(props: { params: Promise<{ productId: string }> }) {
  const { productId } = await props.params;
  const { business, user, store: branch } = await requireBusinessAndOptionalStore(['CASHIER', 'MANAGER', 'OWNER']);
  if (!business || !isFoodBusiness(business.businessCategory)) redirect('/products');

  const dish = await prisma.foodDish.findFirst({
    where: { productId, businessId: business.id },
    include: {
      product: { select: { categoryId: true, name: true, sellingPriceBasePence: true, defaultCostBasePence: true, storefrontDescription: true, storefrontPublished: true } },
      sizes: { orderBy: { sortOrder: 'asc' } },
      inclusions: { orderBy: { sortOrder: 'asc' } },
      groups: { orderBy: { sortOrder: 'asc' }, include: { addons: { orderBy: { sortOrder: 'asc' } } } },
    },
  });
  if (!dish) notFound();

  const balance = dish.stockMode === 'COUNTED' && branch ? await prisma.inventoryBalance.findUnique({
    where: { storeId_productId: { storeId: branch.id, productId } },
    select: { qtyOnHandBase: true },
  }) : null;
  const availability = inventoryAvailability(business.businessCategory, dish, balance?.qtyOnHandBase ?? 0, 0);
  const availabilityText = dish.stockMode === 'COUNTED' && !branch && !dish.soldOut
    ? 'Select a branch to check portions.'
    : availability.status;
  const portionText = dish.stockMode === 'COUNTED' && branch ? availability.quantity : null;
  const sizes = dish.sizes.filter((size) => size.active);

  if (user.role === 'CASHIER') {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link href="/products" className="btn-secondary text-sm">Back to products</Link>
        <section className="card space-y-4 p-4">
          <h1 className="text-2xl font-semibold">{dish.product.name}</h1>
          <p className="font-semibold">{availabilityText}{portionText ? ` · ${portionText}` : ''}</p>
          {dish.allowCustomAmount && <p>{dish.minimumAmountPence == null ? 'Any amount' : 'Any amount from ' + formatMoney(dish.minimumAmountPence, business.currency)}</p>}
          {sizes.length ? <>
            <h2 className="font-semibold">Sizes and prices</h2>
            <dl className="space-y-2">{sizes.map((size) => (
              <div className="flex justify-between gap-3" key={size.id}>
                <dt>{size.name}</dt><dd>{formatMoney(size.pricePence, business.currency)}</dd>
              </div>
            ))}</dl>
          </> : <p>Price {formatMoney(dish.product.sellingPriceBasePence, business.currency)}</p>}
          {dish.groups.map((group) => {
            const extras = group.addons.filter((addon) => addon.active);
            if (!extras.length) return null;
            return <div key={group.id}>
              <h2 className="font-semibold">{group.name}</h2>
              <dl className="mt-2 space-y-2">{extras.map((addon) => (
                <div className="flex justify-between gap-3" key={addon.id}>
                  <dt>{addon.name}</dt><dd>{addon.pricePence ? formatMoney(addon.pricePence, business.currency) : 'Free'}</dd>
                </div>
              ))}</dl>
            </div>;
          })}
        </section>
      </div>
    );
  }

  const latestCost = branch ? await prisma.foodPreparation.findFirst({
    where: { businessId: business.id, storeId: branch.id, productId, undoneAt: null, costPerPortionPence: { not: null } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { costPerPortionPence: true },
  }) : null;
  const draft: DishDraft = {
    categoryId: dish.product.categoryId,
    productId: dish.productId,
    name: dish.product.name,
    startingPriceCedis: cedisInput(dish.product.sellingPriceBasePence),
    estimatedCostCedis: dish.product.defaultCostBasePence > 0 ? cedisInput(dish.product.defaultCostBasePence) : '',
    description: dish.product.storefrontDescription ?? '',
    showOnline: dish.product.storefrontPublished,
    stockMode: dish.stockMode === 'COUNTED' ? 'COUNTED' : 'NOT_COUNTED',
    soldOut: dish.soldOut,
    allowCustomAmount: dish.allowCustomAmount,
    minimumAmountCedis: dish.minimumAmountPence == null ? '' : cedisInput(dish.minimumAmountPence),
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
            {' '}{availabilityText}{portionText ? ` · ${portionText}` : ''}
          </p>
        </div>
        <Link href="/pos" className="btn-secondary text-sm">Try at the till</Link>
      </div>
      {dish.stockMode === 'COUNTED' && branch ? (
        <>
          <PreparePortionsForm productId={dish.productId} storeId={branch.id} currency={business.currency} sizes={sizes.map(({ id, name, isDefault }) => ({ id, name, isDefault }))} />
          <LeftoverWriteOffForm productId={dish.productId} storeId={branch.id} costPerPortionPence={latestCost?.costPerPortionPence ?? null} currency={business.currency} />
        </>
      ) : null}
      {branch && <FoodRecordHistory storeId={branch.id} title="Cooking history"
        records={await loadFoodRecordHistory({ businessId: business.id, storeId: branch.id, productId, timeZone: business.timezone || 'UTC' })} />}
      <DishForm categories={await prisma.category.findMany({ where: { businessId: business.id }, select: { id: true, name: true }, orderBy: { name: 'asc' } })} ingredients={await ingredientOptions(business.id)} initial={draft} productId={dish.productId} />
    </div>
  );
}
