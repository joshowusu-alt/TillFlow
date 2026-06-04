-- Phase 7: scale-readiness indexes for portfolio load and open AR queries.

CREATE INDEX "Business_isDemo_createdAt_idx" ON "Business"("isDemo", "createdAt");
CREATE INDEX "Business_activationStatus_idx" ON "Business"("activationStatus");
CREATE INDEX "Business_subscriptionStatus_idx" ON "Business"("subscriptionStatus");

CREATE INDEX "Customer_businessId_phone_idx" ON "Customer"("businessId", "phone");

CREATE INDEX "SalesInvoice_businessId_paymentStatus_idx" ON "SalesInvoice"("businessId", "paymentStatus");
