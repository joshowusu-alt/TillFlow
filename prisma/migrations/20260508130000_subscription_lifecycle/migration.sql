ALTER TABLE "Business" ADD COLUMN "selectedPlan" TEXT NOT NULL DEFAULT 'STARTER';
ALTER TABLE "Business" ADD COLUMN "trialStartedAt" DATETIME;
ALTER TABLE "Business" ADD COLUMN "subscriptionStatus" TEXT NOT NULL DEFAULT 'TRIAL_ACTIVE';
ALTER TABLE "Business" ADD COLUMN "firstPaymentAt" DATETIME;
ALTER TABLE "Business" ADD COLUMN "currentPeriodStartedAt" DATETIME;
ALTER TABLE "Business" ADD COLUMN "currentPeriodEndsAt" DATETIME;
ALTER TABLE "Business" ADD COLUMN "nextBillingDate" DATETIME;
ALTER TABLE "Business" ADD COLUMN "paymentGraceEndsAt" DATETIME;
ALTER TABLE "Business" ADD COLUMN "suspendedAt" DATETIME;
ALTER TABLE "Business" ADD COLUMN "cancelledAt" DATETIME;
ALTER TABLE "Business" ADD COLUMN "billingAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Business" ADD COLUMN "billingCurrency" TEXT NOT NULL DEFAULT 'GHS';
ALTER TABLE "Business" ADD COLUMN "billingInterval" TEXT NOT NULL DEFAULT 'MONTHLY';
ALTER TABLE "Business" ADD COLUMN "paymentProvider" TEXT;
ALTER TABLE "Business" ADD COLUMN "paymentProviderStatus" TEXT;

UPDATE "Business"
SET
  "selectedPlan" = COALESCE("plan", 'STARTER'),
  "subscriptionStatus" = CASE
    WHEN UPPER(COALESCE("planStatus", '')) IN ('TRIAL', 'TRIALING') THEN 'TRIAL_ACTIVE'
    WHEN UPPER(COALESCE("planStatus", '')) IN ('SUSPENDED', 'READ_ONLY') THEN 'SUSPENDED'
    WHEN UPPER(COALESCE("planStatus", '')) IN ('INACTIVE', 'DEACTIVATED', 'CANCELLED') THEN 'CANCELLED'
    ELSE 'ACTIVE'
  END,
  "firstPaymentAt" = CASE WHEN "lastPaymentAt" IS NOT NULL THEN "lastPaymentAt" ELSE NULL END,
  "currentPeriodStartedAt" = CASE WHEN "lastPaymentAt" IS NOT NULL THEN "lastPaymentAt" ELSE NULL END,
  "currentPeriodEndsAt" = CASE WHEN "nextPaymentDueAt" IS NOT NULL THEN "nextPaymentDueAt" ELSE NULL END,
  "nextBillingDate" = CASE WHEN "nextPaymentDueAt" IS NOT NULL THEN "nextPaymentDueAt" ELSE NULL END,
  "billingAmount" = CASE
    WHEN UPPER(COALESCE("plan", 'STARTER')) = 'PRO' THEN 69900
    WHEN UPPER(COALESCE("plan", 'STARTER')) = 'GROWTH' THEN 34900
    ELSE 19900
  END,
  "billingCurrency" = COALESCE("currency", 'GHS')
WHERE "selectedPlan" IS NOT NULL;

