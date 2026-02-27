'use server';

import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { formString, formOptionalString, formInt } from '@/lib/form-helpers';
import { withBusinessContext, formAction } from '@/lib/action-utils';
import { createCategory, updateCategory, deleteCategory } from '@/lib/services/categories';

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

    await createCategory(businessId, { name, colour, imageUrl, sortOrder });

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

    await updateCategory(id, businessId, { name, colour, imageUrl, sortOrder });

    revalidateTag('pos-categories');
    redirect('/products?tab=categories');
  }, '/products?tab=categories');
}

export async function deleteCategoryAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const id = formString(formData, 'id');

    await deleteCategory(id, businessId);

    revalidateTag('pos-categories');
    redirect('/products?tab=categories');
  }, '/products?tab=categories');
}
