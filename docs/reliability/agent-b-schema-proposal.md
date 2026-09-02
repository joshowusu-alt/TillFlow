# Agent B — schema proposal (integrator merge)

Agent A owns `prisma/schema.prisma`. This is a forward-only proposal.

## `SalesInvoice.saleSource`

```prisma
saleSource String @default("POS")
unreconciledLegacy Boolean @default(false)
```

Values: `POS` | `LATE_OFFLINE` | `ONLINE_ORDER` | `UNRECONCILED_LEGACY`.

Used when a captured offline sale is attached to its **original closed** shift.

## `OfflineSaleAttempt` (recommended)

Durable server record of each sync attempt so replay / mismatch / sequence
checks survive beyond the device queue.

```prisma
model OfflineSaleAttempt {
  id              String   @id @default(cuid())
  businessId      String
  storeId         String
  tillId          String
  shiftId         String?
  cashierUserId   String?
  idempotencyKey  String
  payloadHash     String
  localSequence   Int?
  localSaleTime   DateTime?
  status          String   // synced | already_synced | needs_review | rejected
  reason          String?  // safe reason code, no PII
  salesInvoiceId  String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  business     Business      @relation(fields: [businessId], references: [id])
  salesInvoice SalesInvoice? @relation(fields: [salesInvoiceId], references: [id])

  @@unique([businessId, idempotencyKey])
  @@unique([businessId, tillId, shiftId, localSequence])
  @@index([businessId, status, createdAt])
  @@index([salesInvoiceId])
}
```

The unique `(businessId, tillId, shiftId, localSequence)` tuple is how the
server should reject **duplicate local sequence** across requests. Until this
model exists, Agent B only classifies duplicates inside the same batch.

`SalesInvoice.externalRef = OFFLINE_SYNC:{idempotencyKey}` remains the
stock-decrement idempotency key (`@@unique([businessId, externalRef])`).
