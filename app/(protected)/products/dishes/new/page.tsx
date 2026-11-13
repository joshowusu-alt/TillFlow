import { redirect } from 'next/navigation';
import { requireBusiness } from '@/lib/auth';
import DishForm from '@/components/food/DishForm';
import { isFoodBusiness } from '@/lib/food/business';

export default async function NewDishPage() {
  const { business } = await requireBusiness(['MANAGER', 'OWNER']);
  if (!business || !isFoodBusiness(business.businessCategory)) redirect('/products');

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Add a dish</h1>
        <p className="mt-1 text-sm text-black/60">
          One dish is one product. Set the starting price, what is included, and any extras. Amounts are in cedis (GH₵).
        </p>
      </div>
      <DishForm />
    </div>
  );
}
