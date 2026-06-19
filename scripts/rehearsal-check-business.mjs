import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const business = await prisma.business.findFirst({
  where: { name: 'Adom Test Mart' },
  orderBy: { createdAt: 'desc' },
  select: {
    id: true,
    name: true,
    setupProgressPct: true,
    activationStatus: true,
    trialEndsAt: true,
    subscriptionStatus: true,
    businessCategory: true,
    ownerLastDashboardViewAt: true,
    ownerLastReportViewAt: true,
    storefrontEnabled: true,
    storefrontSlug: true,
  },
});

if (!business) {
  console.log('NOT_FOUND');
  await prisma.$disconnect();
  process.exit(0);
}

const [profile, productCount, user] = await Promise.all([
  prisma.controlBusinessProfile.findUnique({
    where: { businessId: business.id },
    select: {
      referralSource: true,
      referralStatus: true,
      referredByName: true,
      referredByPhone: true,
      onboardingStage: true,
      openSupportIssueCount: true,
      assignedAgentName: true,
    },
  }),
  prisma.product.count({ where: { businessId: business.id } }),
  prisma.user.findFirst({
    where: { businessId: business.id, role: 'OWNER' },
    select: { email: true, name: true },
  }),
]);

console.log(JSON.stringify({ business, profile, productCount, user }, null, 2));
await prisma.$disconnect();
