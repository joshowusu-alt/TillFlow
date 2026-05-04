-- Storefront customer accounts: phone-OTP login, sessions, and link to OnlineOrder.

CREATE TABLE "StorefrontCustomer" (
  "id"          TEXT NOT NULL,
  "businessId"  TEXT NOT NULL,
  "phone"       TEXT NOT NULL,
  "name"        TEXT,
  "email"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  "lastLoginAt" TIMESTAMP(3),
  CONSTRAINT "StorefrontCustomer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StorefrontCustomer_businessId_phone_key" ON "StorefrontCustomer"("businessId", "phone");
CREATE INDEX "StorefrontCustomer_businessId_idx" ON "StorefrontCustomer"("businessId");

ALTER TABLE "StorefrontCustomer"
ADD CONSTRAINT "StorefrontCustomer_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;


CREATE TABLE "StorefrontCustomerOtp" (
  "id"         TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "phone"      TEXT NOT NULL,
  "codeHash"   TEXT NOT NULL,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "attempts"   INTEGER NOT NULL DEFAULT 0,
  "consumedAt" TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StorefrontCustomerOtp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StorefrontCustomerOtp_businessId_phone_createdAt_idx" ON "StorefrontCustomerOtp"("businessId", "phone", "createdAt");
CREATE INDEX "StorefrontCustomerOtp_expiresAt_idx" ON "StorefrontCustomerOtp"("expiresAt");


CREATE TABLE "StorefrontCustomerSession" (
  "id"         TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "tokenHash"  TEXT NOT NULL,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userAgent"  TEXT,
  CONSTRAINT "StorefrontCustomerSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StorefrontCustomerSession_tokenHash_key" ON "StorefrontCustomerSession"("tokenHash");
CREATE INDEX "StorefrontCustomerSession_customerId_idx" ON "StorefrontCustomerSession"("customerId");
CREATE INDEX "StorefrontCustomerSession_expiresAt_idx" ON "StorefrontCustomerSession"("expiresAt");

ALTER TABLE "StorefrontCustomerSession"
ADD CONSTRAINT "StorefrontCustomerSession_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "StorefrontCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "OnlineOrder" ADD COLUMN "customerId" TEXT;
CREATE INDEX "OnlineOrder_customerId_createdAt_idx" ON "OnlineOrder"("customerId", "createdAt");

ALTER TABLE "OnlineOrder"
ADD CONSTRAINT "OnlineOrder_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "StorefrontCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
