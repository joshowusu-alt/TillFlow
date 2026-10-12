-- Forward-only discriminator. Existing rows remain NULL and are not reposted.
ALTER TABLE "SalesPayment" ADD COLUMN "ledgerTreatment" TEXT;
ALTER TABLE "SalesPayment" ADD COLUMN "confirmedAt" TIMESTAMP(3);
