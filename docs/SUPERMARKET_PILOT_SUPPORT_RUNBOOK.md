# TillFlow Supermarket Pilot Support Runbook

This runbook is for the first live supermarket pilots using TillFlow.

Use it when a cashier, supervisor, or support person says any variation of:

- "The printer is not working"
- "The sale is stuck"
- "The network went off"
- "The totals look wrong"
- "A barcode is not scanning"
- "The till will not close"

The goal is simple: keep the store trading safely, protect trust, and capture enough information to fix the issue properly.

---

## 1) Triage order

Always check incidents in this order:

1. **Can the store still trade?**
2. **Did money change hands?**
3. **Was a receipt generated or not?**
4. **Was stock affected or not?**
5. **Is this one device or all devices?**

If customers are waiting, prioritize keeping the store trading safely before deeper diagnosis.

---

## 2) Incident severity

### SEV-1 — stop and escalate immediately

Examples:

- sales complete but totals are clearly wrong
- money received but sale status is unclear
- repeated receipt failures across multiple sales
- app inaccessible for the active till
- shift close numbers are clearly inconsistent with activity
- multiple devices affected at the same time

Action:

- pause risky actions
- move to manager supervision immediately
- collect evidence before retrying blindly

### SEV-2 — degraded but store can continue

Examples:

- one printer failing but browser print works
- one barcode not scanning but search works
- one device is offline but queued sales are visible
- direct print fails but receipt page opens normally

Action:

- use approved workaround
- keep trading
- log incident for follow-up

### SEV-3 — minor inconvenience

Examples:

- slow search on one product
- one catalog typo
- one missing barcode
- cosmetic issue on receipt layout

Action:

- note it
- continue trading
- fix after trading hours if possible

---

## 3) Cashier-first safety rules

Cashiers should be told these rules clearly:

- Do **not** click the same action many times if a sale feels stuck.
- Do **not** guess whether a sale completed.
- Do **not** hand over goods until the manager confirms unclear payment states.
- Do **not** use someone else’s login.
- Do **not** improvise price overrides unless store policy allows it.

When in doubt, stop, call the supervisor, and check the receipt/sales record first.

---

## 4) Printer incidents

### Auto-print prerequisites

Direct receipt printing is only considered fully ready when all of these are true:

- the business **Print Mode** is set to **Direct ESC/POS**
- **QZ Tray** is installed on the till computer
- QZ Tray is running on the till computer
- the site has been allowed/trusted in QZ Tray
- the correct receipt printer is installed and ready

### Symptom

- direct print fails
- no paper output
- receipt page opens but nothing prints

### Immediate checks

1. Confirm the sale completed.
2. Open the receipt page.
3. Use **Print Receipt** in the browser.
4. If direct print is enabled and failed, use **Retry Direct Print** once.
5. Check paper, cable, power, and printer readiness.

### If browser print works

- continue trading
- classify as direct-print integration issue, not sale failure
- note printer model, device, and browser
- check whether QZ Tray is running and whether the site was allowed in QZ Tray

### Escalate if

- neither direct print nor browser print works
- receipt page itself fails to load
- issue affects all tills/devices

---

## 5) Barcode incidents

### Symptom

- item does not scan
- wrong item appears

### Immediate checks

1. Try product search by name.
2. Confirm the item and price visually before adding to cart.
3. Check whether the barcode label is damaged.
4. Record the product name and barcode for catalog cleanup.

### Continue trading if

- product search finds the correct item
- price is verified by cashier/manager

### Escalate if

- multiple barcodes map incorrectly
- the wrong product is returned for several different items
- search also fails to find products that should exist

---

## 6) Offline / sync incidents

### Symptom

- device shows offline state
- pending sales count increases
- sync needs attention state is shown

### Immediate checks

1. Confirm whether the device is actually offline.
2. Check the **Network Status** pill.
3. Open the details panel.
4. Note the pending sales count.
5. If back online, use **Sync** once and observe the result.

### Safe operator guidance

- If the app says sales are being saved locally, continue only under the pilot store offline policy.
- Do not clear browser data.
- Do not sign out repeatedly trying to force sync.
- Do not use a second device to re-enter the same uncertain sale without manager approval.

### Escalate if

- pending count keeps rising after internet returns
- sync errors persist after retry
- a cashier believes a payment was taken but the sale is not visible

---

## 7) Sale stuck / uncertain completion

### Symptom

- cashier clicked complete sale and is unsure what happened
- spinner or processing took too long
- receipt not obvious yet

### Immediate checks

1. Wait a few seconds and observe.
2. Check whether a success banner or receipt page appeared.
3. Check the sales list / latest receipt if available.
4. Confirm whether payment was actually received.
5. Only retry if the manager confirms there is no saved sale.

### Never do this

- do not click complete sale repeatedly in panic
- do not assume failure just because printing failed
- do not record the same sale twice without checking history

### Escalate if

- payment status and sale status cannot be reconciled quickly
- this happens more than once in a short period

---

## 8) Wrong total / wrong payment split

### Symptom

- cashier or manager says the total is wrong
- change due looks wrong
- non-cash split does not look right

### Immediate checks

1. Rebuild the basket mentally from the receipt/cart lines.
2. Check discounts/promotions.
3. Check quantity and units.
4. Check cash received and change due.
5. Check whether mixed payment was used.

### Escalate immediately if

- the total is materially wrong
- the payment split differs from the customer’s actual payment
- several recent transactions show the same problem

This is a high-trust issue. Treat it seriously.

---

## 9) Till open / close issues

### Symptom

- cashier cannot start shift
- till won’t close
- expected cash looks wrong

### Immediate checks

1. Confirm the correct till is selected.
2. Confirm the cashier is signed into the correct account.
3. Check whether another open shift already exists.
4. Review cash drawer entries and recent sales.
5. Compare actual cash to expected cash.

### Escalate if

- opening or closing is blocked without clear reason
- expected cash is clearly inconsistent with recorded sales/payments
- multiple tills show the same problem

---

## 10) Data to capture for every incident

Always record:

- date and time
- store name
- till/device used
- cashier name
- manager on duty
- exact page used (`/pos`, receipt page, inventory page, etc.)
- what the cashier clicked
- what the customer paid
- whether a receipt was produced
- whether the sale appears in history
- screenshots if available

If printing is involved, also capture:

- printer model
- print mode in use
- whether browser print worked
- whether direct print retry worked

---

## 11) End-of-day pilot checks

At the end of every pilot trading day, confirm:

- total sales look believable
- cash expected vs actual cash is acceptable
- non-cash totals look right
- any pending offline sales are understood
- all major incidents were logged
- top product and pricing issues are listed for next-day cleanup

---

## 12) Escalation template

Use this format when reporting a live issue:

- **Severity:** SEV-1 / SEV-2 / SEV-3
- **Store:**
- **Till / Device:**
- **Cashier:**
- **Time noticed:**
- **What happened:**
- **What was clicked:**
- **Did payment happen?:** yes / no / unclear
- **Did receipt generate?:** yes / no / unclear
- **Can the store continue trading?:** yes / no
- **Workaround used:**
- **Screenshot / evidence:**

---

## 13) Command checks for support staff

If technical support has terminal access in a safe environment, the following checks are the most useful:

- `npm run build`
- `npm run test:e2e:critical`
- `GET /api/health`
- `GET /api/metrics` (with auth token in production)

Use the main operations guide for broader maintenance tasks:

- `OPERATIONS_RUNBOOK.md`

---

## 14) Rule of thumb

If the issue is about **printing**, the sale may still be fine.

If the issue is about **money**, **totals**, or **uncertain completion**, treat it as high priority immediately.
