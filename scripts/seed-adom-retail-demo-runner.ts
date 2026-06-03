import { seedAdomRetailDemoBusiness } from '../lib/demo-sandbox/seed';

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== 'true') {
    console.error('Set ALLOW_SEED=true to seed in production.');
    process.exit(1);
  }
  const result = await seedAdomRetailDemoBusiness();
  console.log(
    result.created
      ? `Created Adom Retail Demo business (${result.businessId})`
      : `Refreshed Adom Retail Demo business (${result.businessId})`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => import('../lib/prisma').then(({ prisma }) => prisma.$disconnect()));
