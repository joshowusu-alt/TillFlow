import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
try {
  const u = await prisma.user.findUnique({ where: { email: 'owner@store.com' }, select: { id: true, name: true, role: true, active: true } });
  console.log('user:', JSON.stringify(u));
  const biz = await prisma.business.findFirst({ select: { id: true, name: true } });
  console.log('business:', JSON.stringify(biz));
} catch (e) {
  console.error('DB error:', e.message);
} finally {
  await prisma.$disconnect();
}
