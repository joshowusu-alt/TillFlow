CREATE TABLE "WebhookDeadLetter" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "errorMessage" TEXT,
  "resolved" BOOLEAN NOT NULL DEFAULT false,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookDeadLetter_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebhookDeadLetter_source_resolved_idx" ON "WebhookDeadLetter"("source", "resolved");
