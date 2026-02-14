'use server';

import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { formString, formOptionalString, formInt } from '@/lib/form-helpers';
import { withBusinessContext, formAction } from '@/lib/action-utils';

// ---------------------------------------------------------------------------
// Categories CRUD
// ---------------------------------------------------------------------------

export async function createCategoryAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const name = formString(formData, 'name');
    const colour = formOptionalString(formData, 'colour') || '#059669';
    const imageUrl = formOptionalString(formData, 'imageUrl') || null;
    const sortOrder = formInt(formData, 'sortOrder') || 0;

    await prisma.category.create({
      data: { businessId, name, colour, imageUrl, sortOrder },
    });

    redirect('/products?tab=categories');
  });
}

export async function updateCategoryAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    await withBusinessContext(['MANAGER', 'OWNER']);

    const id = formString(formData, 'id');
    const name = formString(formData, 'name');
    const colour = formOptionalString(formData, 'colour') || '#059669';
    const imageUrl = formOptionalString(formData, 'imageUrl') || null;
    const sortOrder = formInt(formData, 'sortOrder') || 0;

    await prisma.category.update({
      where: { id },
      data: { name, colour, imageUrl, sortOrder },
    });

    redirect('/products?tab=categories');
  });
}

export async function deleteCategoryAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    await withBusinessContext(['MANAGER', 'OWNER']);

    const id = formString(formData, 'id');

    // Unlink products first, then delete
    await prisma.product.updateMany({
      where: { categoryId: id },
      data: { categoryId: null },
    });

    await prisma.category.delete({ where: { id } });

    redirect('/products?tab=categories');
  });
}
