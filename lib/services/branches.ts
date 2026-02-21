import { prisma } from '@/lib/prisma';

function buildBranchCode(name: string, index: number) {
  const compact = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 4);
  const code = compact || `BR${index + 1}`;
  return `${code}${String(index + 1).padStart(2, '0')}`;
}

export async function ensureOrganizationAndBranches(input: {
  businessId: string;
  businessName: string;
}) {
  const organization =
    (await prisma.organization.findUnique({
      where: { businessId: input.businessId },
      select: { id: true, name: true, businessId: true, createdAt: true },
    })) ??
    (await prisma.organization.create({
      data: {
        businessId: input.businessId,
        name: `${input.businessName} Organization`,
      },
      select: { id: true, name: true, businessId: true, createdAt: true },
    }));

  const stores = await prisma.store.findMany({
    where: { businessId: input.businessId },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });

  const existing = await prisma.branch.findMany({
    where: { businessId: input.businessId },
    select: { id: true, storeId: true },
  });
  const existingStoreIds = new Set(existing.map((branch) => branch.storeId));

  for (let index = 0; index < stores.length; index += 1) {
    const store = stores[index];
    if (existingStoreIds.has(store.id)) continue;
    await prisma.branch.create({
      data: {
        businessId: input.businessId,
        organizationId: organization.id,
        storeId: store.id,
        name: store.name,
        code: buildBranchCode(store.name, index),
      },
    });
  }

  return prisma.organization.findUnique({
    where: { id: organization.id },
    include: {
      branches: {
        include: {
          store: { select: { id: true, name: true } },
          devices: { select: { id: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      devices: {
        include: { branch: { select: { id: true, name: true } }, user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
}

export async function resolveBranchIdForStore(input: { businessId: string; storeId: string }) {
  const branch = await prisma.branch.findFirst({
    where: { businessId: input.businessId, storeId: input.storeId, active: true },
    select: { id: true },
  });
  return branch?.id ?? null;
}
