# Controlled pilot operating and recovery procedure

This is a proposed release gate for three supervised Ghanaian businesses. It does not authorise deployment or production data repair.

## Before onboarding each business

- Record owner and manager contact details and the exact browser/device used for each till. Configure the branch on that device before a cashier signs in. Test the cashier's actual password login and one supervised sale/receipt.
- Import or record opening stock with supplier/source evidence. Reconcile opening quantity/value, cash float, customer debt and supplier debt. Opening stock must not be made to balance by inventing sales or cash receipts.
- Confirm the subscribed plan and payment period through the authorised billing process. A backup cannot activate or upgrade a plan. Test unpaid/expired access on a fictional business, not on a live customer's business.
- Prove the actual barcode scanner's keyboard input and the actual printer/browser combination. A browser PDF preview is not proof that a thermal printer works. Keep a documented manual receipt process available until device acceptance passes.
- Explain that MoMo recorded as pending manual confirmation is not proof that the mobile-money provider received funds. Confirm the statement/reference through the authorised owner/manager workflow.
- Explain the supported full-return/refund policy. Do not promise partial item returns or automatically void a paid purchase.

## Daily owner checks

1. Open each till with the physical float actually present.
2. Record supplier/expense cash-outs against the correct till and funding source. Owner-funded purchases must not reduce physical till cash.
3. Confirm pending MoMo using actual statement evidence. Follow up customer and supplier balances separately from cash movement.
4. Count physical cash before closing. Enter the real count, retain variance explanations and investigate discrepancies. Do not edit a count to force zero variance.
5. Check offline/recovery queues on every device. Unsynced sales must remain recoverable after refresh and re-login. **Never clear browser data, uninstall the PWA or switch browser profiles while sales are unsynced.**
6. Reconcile sales/payment totals, cash movements, outstanding credit and stock exceptions. During the first full trading week, the operator reviews the reconciliation with the owner every day.
7. Download a new version1.4 application backup after closing, place it in owner-controlled restricted storage, and record its date/business/control totals. It contains financial and personal data and must not be posted to a group chat. Credentials/MFA secrets are not exported.

## Outage or ambiguous save

- Do not repeatedly create a new sale/payment because a response is slow. Retain the original submission identity and use the software's retry/recovery path.
- For an uncertain charge or payment, retain the receipt/reference/device/approximate time. Check the persisted invoice and payment record before taking money again.
- If an offline sale needs review because the shift closed or stock changed, ask the owner/manager to review the retained entry. Do not delete it merely to remove a warning.
- If the application is unavailable and offline capture is unavailable, use the agreed numbered manual log and receipts. Once service recovers, reconcile each entry before entering it once; retain the manual log as evidence.
- Support escalation should include business, branch, till, receipt/reference, time, observed message and whether cash/provider funds changed. Do not send passwords, MFA codes or connection strings.

## Backup and recovery

- Proposed application-export RPO: one trading day if the daily closing backup is completed. This is a target requiring a successful recurring process, not a provider guarantee. The previously inspected database history setting was six hours; verify it at release and do not treat it as an independent off-platform backup.
- Establish RTO by timing a clean isolated restore on the approved release. Do not promise a recovery duration before that exercise passes.
- Version1.4 application restore is same-business core-trading recovery. It retains stock, drawer evidence, journals, payment/collection links, replay keys and document sequences. It preserves the restoring owner's current password/MFA/PIN from the server; other users must reset their passwords afterwards. All sessions are invalidated and the owner signs in again.
- The signed-in owner must be present and active in the snapshot with the same email. Legacy1.3 snapshots and snapshots missing cash/replay evidence are refused before changes. Do not manufacture missing history.
- Businesses with storefront orders, migration packages or product-import history require operator-assisted full recovery; the application refuses this unsupported restore rather than silently deleting linked workflows.
- Fresh-database disaster recovery is a separate operator procedure: preserve business/record identity, commercial configuration, authentication factors and all dependent tables. The same-tenant application restore test alone does not certify it.
- Production restore/repair always needs the founder's specific approval, a pre-change snapshot, expected control totals, a tested rollback and named operator. Never practise on production.

## Release and rollback gate

Require clean exact-commit CI, persisted financial/backup tests, representative concurrency measurements and real login/mobile/device acceptance. The security PR and reliability PR must be reviewed together with the financial fixes before the launch verdict changes.

Do not roll offline devices back to a v3-only IndexedDB reader after schema v4 activation. Use a v4-capable recovery build and retain unsynced queues. An application rollback must not reset financial data or overwrite closed shifts.
