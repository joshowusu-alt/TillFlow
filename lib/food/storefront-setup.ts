import { readWeeklyHoursForm, serializeWeeklyHours } from '@/lib/business-hours';
import { isFoodBusiness } from '@/lib/food/business';
import { prisma } from '@/lib/prisma';
import { DEFAULT_FOOD_PREP_MINUTES } from '@/lib/food/storefront-defaults';

export async function saveFoodStorefrontSetup(businessId: string, formData: FormData) {
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { businessCategory: true },
  });
  if (!isFoodBusiness(business.businessCategory)) throw new Error('This setup is for food businesses.');
  const rawPrep = String(formData.get('pickupPrepMinutes') ?? '').trim();
  const prep = rawPrep === '' ? DEFAULT_FOOD_PREP_MINUTES : Number(rawPrep);
  if (!Number.isInteger(prep) || prep < 0 || prep > 1440) {
    throw new Error('Enter a preparation time between 0 and 1440 minutes.');
  }
  return prisma.business.update({
    where: { id: businessId, businessCategory: business.businessCategory },
    data: {
      storefrontHoursJson: formData.get('hoursEnabled') === 'on'
        ? serializeWeeklyHours(readWeeklyHoursForm(formData))
        : undefined,
      storefrontPickupPrepMinutes: prep,
    },
    select: { storefrontSlug: true },
  });
}
