import { redirect } from 'next/navigation';
import { requireBusinessStore } from '@/lib/auth';
import { isFoodBusiness } from '@/lib/food/business';
import { ingredientOptions } from '@/lib/food/ingredient-options';
import IngredientUsageForm from '@/components/food/IngredientUsageForm';

export default async function IngredientsUsedPage() {
  const { business, store } = await requireBusinessStore(['OWNER', 'MANAGER']);
  if (!business || !isFoodBusiness(business.businessCategory)) redirect('/products');
  return <div className="mx-auto max-w-3xl">
    <IngredientUsageForm storeId={store.id} products={await ingredientOptions(business.id)} currency={business.currency} />
  </div>;
}
