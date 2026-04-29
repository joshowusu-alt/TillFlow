ALTER TABLE "Business" ADD COLUMN "storefrontHoursJson" TEXT;
ALTER TABLE "Business" ADD COLUMN "storefrontPickupPrepMinutes" INTEGER NOT NULL DEFAULT 0;
