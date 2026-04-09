import { PrismaClient } from '@prisma/client';
import { ensureControlPlaneBusinessBootstrap } from '../lib/control-plane-bootstrap';

const prisma = new PrismaClient();

async function main() {
  const businesses = await prisma.business.findMany({
    select: {
      id: true,
      name: true,
      plan: true,
      planStatus: true,
      planSetAt: true,
      nextPaymentDueAt: true,
      lastPaymentAt: true,
      phone: true,
      users: {
        where: { role: 'OWNER' },
        take: 1,
        select: {
          name: true,
          email: true,
        },
      },
      controlProfile: {
        select: { id: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  let created = 0;
  let skipped = 0;

  for (const business of businesses) {
    if (business.controlProfile) {
      skipped += 1;
      continue;
    }

    const owner = business.users[0];
    await ensureControlPlaneBusinessBootstrap(prisma as any, {
      businessId: business.id,
      ownerName: owner?.name ?? business.name,
      ownerPhone: business.phone,
      ownerEmail: owner?.email,
      plan: business.plan,
      status: business.planStatus,
      nextDueDate: business.nextPaymentDueAt,
      lastPaymentDate: business.lastPaymentAt,
      supportStatus: 'UNREVIEWED',
      notes: 'Backfilled into Tishgroup Control. Awaiting first commercial review.',
      startedAt: business.planSetAt,
    });
    created += 1;
  }

  console.log(`Backfill complete. Created ${created} control-plane profiles, skipped ${skipped} existing profiles.`);
}

main()
  .catch((error) => {
    console.error('[backfill-control-plane] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });