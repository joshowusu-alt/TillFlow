-- Migration: add_business_sequence
-- Adds the BusinessSequence table for atomic per-business invoice numbering.
-- Uses INSERT ... ON CONFLICT DO UPDATE SET nextVal = nextVal + 1 RETURNING nextVal
-- instead of a COUNT(*) scan, eliminating the race condition and full table scan
-- that occur at high transaction volumes.

CREATE TABLE "BusinessSequence" (
    "businessId"   TEXT NOT NULL,
    "sequenceName" TEXT NOT NULL,
    "nextVal"      INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY ("businessId", "sequenceName"),
    CONSTRAINT "BusinessSequence_businessId_fkey"
        FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
