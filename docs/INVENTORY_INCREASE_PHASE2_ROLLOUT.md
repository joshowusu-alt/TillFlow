# Inventory Increase Phase 2 — Business-Scoped Rollout

## Purpose

Phase 2 inventory increases (physical-count surplus / stock found) are gated by **two** independent server-side conditions:

1. Global flag enabled
2. Target business ID exactly allowlisted

This prevents all-or-nothing Production exposure when the global flag is turned on.

Merging code that supports the allowlist **does not** authorise Production enablement or allowlisting.

## Configuration

| Variable | Required | Meaning |
| --- | --- | --- |
| `TILLFLOW_INVENTORY_ADJUST_PHASE2_INCREASE` | Yes (for any increase) | Must be exactly `1` to enable the Phase 2 code path |
| `TILLFLOW_INVENTORY_ADJUST_PHASE2_BUSINESS_IDS` | Yes (for any increase) | Comma- and/or whitespace-separated **immutable business IDs** |

Both must be satisfied:

`eligible = (PHASE2_INCREASE === "1") AND (businessId ∈ parsed allowlist)`

### Format

- Use exact business IDs only (never names, emails, domains, or display labels).
- Trim whitespace; empty entries are ignored.
- Duplicate IDs are harmless.
- Missing, empty, or fully invalid allowlist → **no** eligible businesses (fail closed).
- Tokens such as `*`, `all`, `true`, `yes`, `1`, `global` are ignored and **never** mean every business.

### Example (fake IDs only)

```bash
TILLFLOW_INVENTORY_ADJUST_PHASE2_INCREASE=1
TILLFLOW_INVENTORY_ADJUST_PHASE2_BUSINESS_IDS=cmexamplebiz00000000000001,cmexamplebiz00000000000002
```

Do not commit real Production business IDs in documentation, PRs, or examples.

## Truth table

| Global flag | Business allowlisted | Result |
| --- | ---: | --- |
| Off / missing | No | Denied |
| Off / missing | Yes | Denied |
| On | No | Denied |
| On | Yes | Continue to role, billing, and validation checks |

Denied responses stay generic (`Inventory increases are temporarily unavailable` / Phase 2 not enabled) so eligibility is not leaked.

## Enforcement points (server-authoritative)

| Location | Role |
| --- | --- |
| `lib/inventory-increase-flag.ts` | Centralised parse + eligibility helpers |
| `lib/services/inventory-increase.ts` → `createInventoryIncrease` | Hard gate before idempotency reads and any mutation |
| `app/actions/inventory.ts` → increase branch | Action-level gate using session `businessId` |
| `app/(protected)/inventory/adjustments/page.tsx` | UI visibility only (not the security boundary) |

UI hiding is convenience only. Crafted requests still hit the service gate.

Tenant binding remains enforced: the actor’s session business must own the store/product. Passing an allowlisted foreign business ID cannot post for another tenant.

## Operations

### Add a canary business

1. Obtain the immutable business ID from an authorised operator source (not from UI labels).
2. Append it to `TILLFLOW_INVENTORY_ADJUST_PHASE2_BUSINESS_IDS` (exact ID).
3. Ensure `TILLFLOW_INVENTORY_ADJUST_PHASE2_INCREASE=1`.
4. Apply env on the target Vercel environment (Preview or Production as authorised).
5. **Redeploy** (or otherwise restart) so the runtime picks up env changes for serverless deployments.
6. Verify: allowlisted Owner/Manager sees Record increase; a non-allowlisted business does not; Cashier remains denied.

### Remove a business / roll back Phase 2 posting ability

1. Remove the business ID from the allowlist, **or** set `TILLFLOW_INVENTORY_ADJUST_PHASE2_INCREASE` to anything other than `1` / remove it.
2. Redeploy so the change is effective.
3. Confirm Record increase is unavailable for that business.

**Important:** Disabling the flag or removing a business from the allowlist prevents **new** postings. It does **not** reverse completed inventory, journal, or audit records. Use the approved accounting correction procedure if remediation is required. Do not delete or rewrite Production postings.

### Verification checklist

- [ ] Global flag off → allowlisted business denied
- [ ] Global flag on → non-allowlisted business denied
- [ ] Global flag on → allowlisted business Owner/Manager can see increase UI
- [ ] Cashier / unauthenticated / billing-restricted actors denied
- [ ] Direct server increase for non-allowlisted business denied with no durable records
- [ ] Phase 1 decrease behaviour unchanged

## Early-rollout concurrency warning

Cross-workflow concurrency involving purchase receipts, opening stock, transfers, returns, and legacy absolute read-modify-write adjustments remains a documented limitation. Do **not** adjust the same product concurrently through those workflows during early Phase 2 rollout.

## Related code

- Flag helper: `lib/inventory-increase-flag.ts`
- Posting service: `lib/services/inventory-increase.ts`
- Accounts: Debit `1200` Inventory / Credit `4100` Inventory Gain & Surplus (`INCOME`)
