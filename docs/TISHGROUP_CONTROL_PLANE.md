# Tish Group Control Plane

This document defines the separate internal product that Tish Group should use to manage the Tillflow portfolio.

## Positioning

Tillflow is the tenant product used by customer businesses.

Tish Group Control is the internal control plane used by Tish Group staff to manage:

- plan assignment
- payment tracking
- due dates
- grace and fallback risk
- read-only recovery
- portfolio revenue
- account health and support follow-up

It should be deployed separately from Tillflow, with separate authentication and staff-only access.

## Why this must stay separate

Putting cross-tenant portfolio tooling inside Tillflow would mix two very different concerns:

- single-business operations
- multi-business portfolio management

The control plane should have access to every managed business, commercial records, and internal notes. That makes it operationally and security-wise distinct from the tenant product.

## First product surface

The first version of Tish Group Control should include five core modules:

### 1. Portfolio

For every business:

- business name
- owner details
- assigned relationship owner
- purchased plan
- effective access today
- signed-up date
- plan start date
- next due date
- last payment date
- commercial state
- last activity date

### 2. Collections

The team should not work one long list. They should work explicit queues:

- healthy
- due soon
- overdue in grace
- Starter fallback
- read-only

Each queue should drive a different action pattern.

### 3. Revenue

The control plane should show:

- MRR
- ARR
- expected collections this month
- overdue receivables
- revenue by plan
- count of active businesses by plan

### 4. Business detail

Each business should have a full internal detail view with:

- owner and contact information
- commercial timeline
- payment history
- internal notes
- current risk posture
- next action checklist

### 5. Playbooks

Tish Group should operate from explicit rules, not informal memory. The control plane should eventually embed the operational playbooks for:

- onboarding
- renewal reminders
- overdue handling
- fallback handling
- read-only recovery

## Data model direction

The current Tillflow business record can continue to carry the entitlement fields used for runtime access control, but Tish Group Control should own richer internal records.

The shared Prisma schema now includes the first control-plane tables for this:

- `ControlStaff`
- `ControlBusinessProfile`
- `ControlSubscription`
- `ControlPayment`
- `ControlNote`

Recommended control-plane entities:

### ManagedBusiness

- businessId
- displayName
- ownerName
- ownerPhone
- ownerEmail
- assignedManager
- supportStatus

### Subscription

- businessId
- purchasedPlan
- billingCadence
- status
- startDate
- nextDueDate
- lastPaymentDate
- readOnlyAt
- gracePolicyVersion

### Payment

- businessId
- amount
- currency
- paidAt
- method
- reference
- receivedByUserId
- note

### CommercialEvent

- businessId
- eventType
- oldValue
- newValue
- createdAt
- createdBy

### SupportNote

- businessId
- note
- category
- assignedTo
- createdAt

The current implementation in `tishgroup-control/` already reads live Tillflow `Business` rows. When the new control-plane tables are available, it overlays assigned managers, contact overrides, subscription records, recent payments, and internal notes on top of that live tenant data.

## Integration model with Tillflow

The separation of responsibilities should be strict:

- Tish Group Control changes commercial state.
- Tillflow reads that state.
- Tillflow enforces access.

This is now the intended runtime model in the codebase:

- Tish Group Control has internal staff authentication backed by `ControlStaff`
- Tish Group Control can write subscriptions, payments, notes, reviews, and staff assignments
- those writes are mirrored into Tillflow `Business.plan`, `Business.planStatus`, `Business.trialEndsAt`, `Business.lastPaymentAt`, `Business.nextPaymentDueAt`, and `Business.billingNotes`
- the tenant Billing page remains visible for context, but direct payment and due-date writes there are retired so the control plane is the commercial source of truth

The current implementation also includes:

- TG staff management screens
- an unreviewed new-accounts queue
- business review audit fields (`reviewedAt`, `reviewedByStaffId`)
- bulk assignment and bulk review actions for the unreviewed queue

That means:

- when payment is recorded in the control plane, Tillflow should restore access immediately
- when due dates pass, Tillflow should apply grace, fallback, or read-only automatically

## Rollout plan

### Phase 1

Build the separate internal app with:

- portfolio overview
- business list
- business detail view
- collections queues
- revenue summary
- operating playbooks

### Phase 2

Use the new control-plane tables as the source of truth and add:

- internal auth
- payment history
- plan provisioning
- due-date editing
- commercial notes

This phase is now materially underway: the app already has staff auth, subscription writes, payment writes, and internal notes wired into Tillflow billing fields.

### Phase 3

Add deeper operational tooling:

- reminder workflows
- support assignments
- churn and risk reporting
- revenue trend charts
- separate deployment and staff audit trails

## Current scaffold

The initial scaffold for this product now lives in [tishgroup-control](../tishgroup-control).