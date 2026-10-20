import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export type CategoryInput = {
  name: string;
  colour: string;
  imageUrl: string | null;
  sortOrder: number;
};

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Create a new category for a business.
 * Returns the created record's id.
 */
export async function createCategory(
  businessId: string,
  data: CategoryInput
): Promise<{ id: string }> {
  return prisma.category.create({
    data: { businessId, ...data },
    select: { id: true },
  });
}

/**
 * Update an existing category's fields.
 * Throws if the category is not found or does not belong to the business.
 */
export async function updateCategory(
  id: string,
  businessId: string,
  data: CategoryInput
): Promise<void> {
  const category = await prisma.category.findFirst({
    where: { id, businessId },
    select: { id: true },
  });
  if (!category) throw new Error('Category not found. It may have been removed.');

  await prisma.category.update({
    where: { id: category.id },
    data,
  });
}

/**
 * Delete a category, first unlinking any products that reference it so no
 * orphaned foreign-key references remain.
 * Throws if the category is not found or does not belong to the business.
 */
export async function deleteCategory(id: string, businessId: string): Promise<void> {
  await prisma.$transaction(async tx => {
  const divisions = await tx.productDivision.count({ where: { categoryId: id, businessId } });
  if (divisions) throw new Error('This category has divisions. Keep it to preserve the product hierarchy.');
  const category = await tx.category.findFirst({
    where: { id, businessId },
    select: { id: true },
  });
  if (!category) throw new Error('Category not found. It may have been removed.');

  await tx.product.updateMany({
    where: { categoryId: category.id, businessId },
    data: { categoryId: null },
  });

  await tx.category.delete({ where: { id: category.id } });
  });
}
