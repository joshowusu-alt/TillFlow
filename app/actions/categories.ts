'use server';

import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { formString, formOptionalString, formInt } from '@/lib/form-helpers';
import { withBusinessContext, formAction, safeAction, ok } from '@/lib/action-utils';
import { createCategory, updateCategory, deleteCategory } from '@/lib/services/categories';
import { audit } from '@/lib/audit';
import { posCategoriesTag } from '@/lib/cache/pos-tags';

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

    revalidateTag(posCategoriesTag(businessId));
    redirect('/products?tab=categories');
  }, '/products?tab=categories');
}

export async function updateCategoryAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const id = formString(formData, 'id');
    const name = formString(formData, 'name');
    const colour = formOptionalString(formData, 'colour') || '#059669';
    const imageUrl = formOptionalString(formData, 'imageUrl') || null;
    const sortOrder = formInt(formData, 'sortOrder') || 0;

    await updateCategory(id, businessId, { name, colour, imageUrl, sortOrder });

    audit({ businessId, userId: user.id, userName: user.name, userRole: user.role, action: 'CATEGORY_UPDATE', entity: 'Category', entityId: id, details: { name } }).catch(() => {});

    revalidateTag(posCategoriesTag(businessId));
    redirect('/products?tab=categories');
  }, '/products?tab=categories');
}

export async function deleteCategoryAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const id = formString(formData, 'id');

    await deleteCategory(id, businessId);

    audit({ businessId, userId: user.id, userName: user.name, userRole: user.role, action: 'CATEGORY_DELETE', entity: 'Category', entityId: id }).catch(() => {});

    revalidateTag(posCategoriesTag(businessId));
    redirect('/products?tab=categories');
  }, '/products?tab=categories');
}

/** Inline creation keeps the unsaved product form mounted. */
export async function quickCreateCategoryAction(rawName: string) {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
    const name = rawName.trim();
    if (!name || name.length > 100 || /[\x00-\x1f]/.test(name)) throw new Error('Enter a category name of up to 100 characters.');
    const existing = await prisma.category.findFirst({where:{businessId,name:{equals:name,mode:'insensitive'}},select:{id:true,name:true}});
    if (existing) return ok(existing);
    const category = await createCategory(businessId, {name,colour:'#059669',imageUrl:null,sortOrder:0});
    await audit({businessId,userId:user.id,userName:user.name,userRole:user.role,action:'CATEGORY_CREATE',entity:'Category',entityId:category.id,details:{name}});
    revalidateTag(posCategoriesTag(businessId));
    return ok({id:category.id,name});
  });
}
