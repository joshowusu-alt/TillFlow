import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const business = await prisma.business.findFirst({
  where: { name: 'Adom Test Mart' },
  orderBy: { createdAt: 'desc' },
});

const products = await prisma.product.findMany({
  where: { businessId: business.id },
  include: {
    productUnits: { include: { unit: true } },
    inventoryBalances: true,
  },
});

console.log(JSON.stringify({ products }, null, 2));
await prisma.$disconnect();
