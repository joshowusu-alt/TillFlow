'use server';

import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { formString, formOptionalString, formInt } from '@/lib/form-helpers';
import { withBusinessContext, formAction, err } from '@/lib/action-utils';

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

    revalidateTag('pos-categories');
    redirect('/products?tab=categories');
  }, '/products?tab=categories');
}

export async function updateCategoryAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const id = formString(formData, 'id');
    const name = formString(formData, 'name');
    const colour = formOptionalString(formData, 'colour') || '#059669';
    const imageUrl = formOptionalString(formData, 'imageUrl') || null;
    const sortOrder = formInt(formData, 'sortOrder') || 0;

    const category = await prisma.category.findFirst({
      where: { id, businessId },
      select: { id: true },
    });
    if (!category) return err('Category not found. It may have been removed.');

    await prisma.category.update({
      where: { id: category.id },
      data: { name, colour, imageUrl, sortOrder },
    });

    revalidateTag('pos-categories');
    redirect('/products?tab=categories');
  }, '/products?tab=categories');
}

export async function deleteCategoryAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const id = formString(formData, 'id');

    const category = await prisma.category.findFirst({
      where: { id, businessId },
      select: { id: true },
    });
    if (!category) return err('Category not found. It may have been removed.');

    // Unlink products first, then delete
    await prisma.product.updateMany({
      where: { categoryId: category.id, businessId },
      data: { categoryId: null },
    });

    await prisma.category.delete({ where: { id: category.id } });

    revalidateTag('pos-categories');
    redirect('/products?tab=categories');
  }, '/products?tab=categories');
}
