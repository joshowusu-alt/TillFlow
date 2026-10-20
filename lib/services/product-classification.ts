import { prisma } from '@/lib/prisma';

export function classificationName(raw: string) {
  const name = raw.trim();
  if (!name || name.length > 100 || /[\x00-\x1f]/.test(name)) {
    throw new Error('Enter a name of up to 100 characters.');
  }
  return name;
}

export async function listProductDivisions(businessId: string) {
  return prisma.productDivision.findMany({
    where: { businessId, category: { businessId } },
    select: { id: true, name: true, categoryId: true, groups: {
      where: { businessId }, select: { id: true, name: true }, orderBy: { name: 'asc' },
    } },
    orderBy: { name: 'asc' },
  });
}

/** Derive the umbrella from a group; never trust a submitted category/group pair. */
export async function resolveProductClassification(
  db: any, businessId: string, categoryId: string | null, groupId?: string | null,
) {
  if (!groupId?.trim()) return { categoryId, groupId: null };
  const group = await db.productGroup.findFirst({
    where: { id: groupId.trim(), businessId, division: { businessId, category: { businessId } } },
    select: { id: true, division: { select: { categoryId: true } } },
  });
  if (!group) throw new Error('This product group is unavailable. Select a group from this business.');
  return { categoryId: group.division.categoryId as string, groupId: group.id as string };
}

export async function createClassificationNode(businessId: string, kind: 'division' | 'group', parentId: string, rawName: string) {
  const name = classificationName(rawName);
  return prisma.$transaction(async tx => {
    if (kind === 'division') {
      const parent = await tx.category.findFirst({ where: { id: parentId, businessId }, select: { id: true } });
      if (!parent) throw new Error('Choose a category from this business.');
      const siblings = await tx.productDivision.findMany({ where: { businessId, categoryId: parent.id }, select: { id: true, name: true } });
      const existing = siblings.find(item => item.name.toLowerCase() === name.toLowerCase());
      return existing ?? tx.productDivision.create({ data: { businessId, categoryId: parent.id, name }, select: { id: true, name: true } });
    }
    const parent = await tx.productDivision.findFirst({ where: { id: parentId, businessId, category: { businessId } }, select: { id: true } });
    if (!parent) throw new Error('Choose a division from this business.');
    const siblings = await tx.productGroup.findMany({ where: { businessId, divisionId: parent.id }, select: { id: true, name: true } });
    const existing = siblings.find(item => item.name.toLowerCase() === name.toLowerCase());
    return existing ?? tx.productGroup.create({ data: { businessId, divisionId: parent.id, name }, select: { id: true, name: true } });
  });
}
