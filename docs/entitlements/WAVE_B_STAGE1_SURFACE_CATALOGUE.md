# Wave B Stage 1 — surface catalogue map

Stage 1 is the decision foundation only. Report pages, export routes, store queries, navigation and SMS are not migrated. Live routes do not import `lib/entitlements`.

The only runtime access table is `lib/entitlements/surface-catalogue.ts`. `lib/entitlements/catalogue-coverage.test.ts` is the executable copy of this map. Contract sections C and E.0 win if this note and the catalogue ever disagree.

Plan resolution inside the decision is `getBusinessPlan(plan ?? mode, storeMode)`. `selectedPlan` is not an input. `getBillingEntitlement` is unchanged in this stage.

`OPERATIONAL_WRITE` is not a catalogue action. `decideBusinessCapability` is the separate write decision. `owner_daily_summary_whatsapp_legacy` is absent and fails closed as `CATALOGUE_UNKNOWN`.

Account rows `account_settings`, `organization_settings` and `getting_started` are the D.1 / H.2 reachability entries. They are not report-matrix product rows. Backup and data repair have no stable IDs and are not entries.

Billing policy shorthand: `RO` is read-only under restriction; `DENY` blocks; `ALLOW` continues. Cancelled `VIEW` on `notification_settings` also sets `destinationMask`. Every `EXPORT` row sets `auditRequired` for a later stage. This stage does not write audit rows.

| Stable ID | Plan | Scope | Pro consolidation | Range cap | Actions and locked state |
|---|---|---|---|---|---|
| `reports_hub` | Starter | NONE | — | no | VIEW Owner/Manager. Restricted RO. Cancelled deny. |
| `command_center` | Starter | STORE_DIMENSIONAL | yes | yes | VIEW Owner/Manager. Restricted RO. |
| `trading_report` | Starter | STORE_DIMENSIONAL | yes | no | VIEW Owner/Manager. Restricted RO. |
| `money_received` | Starter | STORE_DIMENSIONAL | yes | no | VIEW Owner/Manager. Restricted RO. |
| `momo_confirmation` | Starter | STORE_DIMENSIONAL | yes | no | VIEW Owner/Manager. Restricted RO. |
| `business_movement` | Starter | STORE_DIMENSIONAL | yes | yes | VIEW Owner/Manager. Restricted RO. |
| `receipt_transactions` | Starter | STORE_DIMENSIONAL | yes | no | VIEW Owner/Manager. Restricted RO. |
| `weekly_digest` | Starter | STORE_DIMENSIONAL | yes | yes | VIEW Owner/Manager. Restricted RO. Not a whole-business exception. |
| `export_weekly_digest` | Starter | STORE_DIMENSIONAL | yes | yes | EXPORT Owner/Manager. Restricted deny. Audit required. |
| `sales_analytics` | Growth | STORE_DIMENSIONAL | yes | yes | VIEW Owner/Manager. Restricted RO. |
| `profit_margins` | Growth | STORE_DIMENSIONAL | yes | yes | VIEW Owner/Manager. Restricted RO. |
| `export_margins` | Growth | STORE_DIMENSIONAL | yes | yes | EXPORT Owner/Manager. Restricted deny. Audit required. |
| `sales_by_supplier` | Growth | STORE_DIMENSIONAL | yes | yes | VIEW Owner/Manager. Restricted RO. |
| `export_sales_by_supplier` | Growth | STORE_DIMENSIONAL | yes | yes | EXPORT Owner/Manager. Restricted deny. Audit required. |
| `reorder_suggestions` | Growth | STORE_DIMENSIONAL | yes | no | VIEW Owner/Manager. Restricted RO. |
| `income_statement` | Growth | ACCOUNTING_WHOLE_BUSINESS | no | yes | VIEW Owner/Manager. Restricted RO. Supplied `storeId` is invalid. Label: Whole business — not separated by branch. |
| `balance_sheet` | Growth | ACCOUNTING_WHOLE_BUSINESS | no | yes | VIEW Owner/Manager. Restricted RO. Supplied `storeId` is invalid. |
| `cash_flow_statement` | Growth | ACCOUNTING_WHOLE_BUSINESS | no | yes | VIEW Owner/Manager. Restricted RO. Supplied `storeId` is invalid. |
| `export_financials` | Growth | ACCOUNTING_WHOLE_BUSINESS | no | yes | EXPORT Owner/Manager. Restricted deny. Audit required. |
| `cash_drawer_report` | Starter | STORE_DIMENSIONAL | yes | no | VIEW Owner/Manager. Restricted RO. |
| `export_eod_csv` | Starter | STORE_DIMENSIONAL | yes | no | EXPORT Owner/Manager. Restricted deny. Audit required. |
| `export_eod_pdf` | Starter | STORE_DIMENSIONAL | yes | no | EXPORT Owner/Manager. Restricted deny. Audit required. |
| `drawer_drilldown` | Starter | STORE_DIMENSIONAL | no | no | VIEW Owner/Manager/Cashier. Restricted RO. `ALL` is forbidden on every plan. |
| `risk_monitor` | Growth | STORE_DIMENSIONAL | yes | yes | VIEW Owner/Manager. Restricted RO. Omitted Pro scope stays the operational store. |
| `export_risk_summary` | Growth | STORE_DIMENSIONAL | yes | yes | EXPORT Owner/Manager. Restricted deny. Audit required. |
| `stock_movements` | Starter | STORE_DIMENSIONAL | yes | yes | VIEW Owner/Manager. Restricted RO. |
| `exports_hub` | Starter | NONE | — | no | VIEW Owner/Manager. Restricted RO. |
| `audit_log` | Pro | TENANT_ADMIN | — | no | VIEW Owner. Restricted RO. |
| `owner_brief` | Pro | FIXED_CONSOLIDATED | always all branches | no | VIEW Owner. Restricted RO. Any supplied `storeId` is invalid. Label: Consolidated — all branches. |
| `export_owner_brief` | Pro | FIXED_CONSOLIDATED | always all branches | no | EXPORT Owner. Restricted deny. Audit required. |
| `cashflow_forecast` | Pro | FIXED_CONSOLIDATED | always all branches | no | VIEW Owner. Restricted RO. Any supplied `storeId` is invalid. |
| `supplier_ageing` | Starter | STORE_DIMENSIONAL | yes | no | VIEW Owner/Manager. Restricted RO. |
| `export_supplier_ageing` | Starter | STORE_DIMENSIONAL | yes | no | EXPORT Owner/Manager. Restricted deny. Audit required. |
| `customer_statement` | Starter | STORE_DIMENSIONAL | yes | no | EXPORT Owner/Manager. Restricted deny. Audit required. |
| `supplier_statement` | Starter | STORE_DIMENSIONAL | yes | no | EXPORT Owner/Manager. Restricted deny. Audit required. |
| `export_sales` | Starter | STORE_DIMENSIONAL | yes | no | EXPORT Owner/Manager. Restricted deny. Audit required. Starter excludes Cost, Margin, Margin %, Cost of goods. |
| `export_purchases` | Starter | STORE_DIMENSIONAL | yes | no | EXPORT Owner/Manager. Restricted deny. Audit required. |
| `export_reversals` | Starter | STORE_DIMENSIONAL | yes | no | EXPORT Owner/Manager. Restricted deny. Audit required. |
| `export_inventory` | Starter | STORE_DIMENSIONAL | yes | no | EXPORT Owner/Manager. Restricted deny. Audit required. |
| `export_products` | Starter | TENANT_CATALOG | — | no | EXPORT Owner/Manager. Restricted deny. Audit required. |
| `export_money_received` | Starter | STORE_DIMENSIONAL | yes | no | EXPORT Owner/Manager. Restricted deny. Audit required. |
| `export_momo_confirmation` | Starter | STORE_DIMENSIONAL | yes | no | EXPORT Owner/Manager. Restricted deny. Audit required. |
| `export_business_movement` | Starter | STORE_DIMENSIONAL | yes | yes | EXPORT Owner/Manager. Restricted deny. Audit required. |
| `export_pack` | Starter | PER_MEMBER | per member | no | VIEW Owner/Manager restricted RO. EXPORT Owner/Manager restricted deny. Starter sales-column exclusions. Audit required. |
| `product_labels` | Growth | NONE | — | no | VIEW Owner/Manager/Cashier. Restricted RO. |
| `export_labels` | Growth | NONE | — | no | EXPORT Owner/Manager/Cashier. Restricted deny. Audit required. |
| `storefront_analytics` | Growth + `onlineStorefront` | STOREFRONT_DOMAIN | no | yes | VIEW Owner/Manager. Restricted RO. A physical `storeId` is invalid. Label: Online storefront. |
| `online_store_settings` | Growth + `onlineStorefront` | NONE | — | no | VIEW Owner/Manager. Restricted RO. |
| `notification_settings` | Growth | NONE | — | no | Owner only. VIEW allowed in restricted and cancelled, masked when cancelled. CONFIGURE, PREVIEW and SEND denied in both locked states. DISABLE allowed in open, restricted and cancelled. |
| `owner_daily_summary` | Growth | STORE_DIMENSIONAL | yes | no | SEND_DELIVERY has no user role. SYSTEM enqueue may call it with trigger SCHEDULED. DISABLE is Owner and allowed in restricted and cancelled. |
| `sale_detail` | Starter | TENANT_RECORD | — | no | VIEW Owner/Manager/Cashier. Restricted RO. A cashier record owner other than the actor is `SCOPE_TENANT_MISMATCH`. |
| `legacy_reports_sales_redirect` | Starter | NONE | — | no | VIEW Owner/Manager. Restricted RO. |
| `cron_eod_summary` | Growth | STORE_DIMENSIONAL | yes | no | SEND_DELIVERY only. SYSTEM enqueue job only, trigger SCHEDULED. Restricted and cancelled deny. |
| `cron_dispatch_outbox` | Growth | STORE_DIMENSIONAL | yes | no | SEND_DELIVERY only. SYSTEM dispatch job only, trigger SCHEDULED. |
| `seed_once` | Starter | NONE | — | no | No actions. Any decision is `CATALOGUE_UNKNOWN`. The seed route is unchanged. |
| `user_admin` | Starter | NONE | — | no | VIEW Owner. Restricted RO. Writes stay on `decideBusinessCapability`. |
| `billing_settings` | Starter | NONE | — | no | VIEW Owner/Manager. Allowed in restricted and cancelled. |
| `account_settings` | Starter | NONE | — | no | VIEW Owner/Manager/Cashier. Allowed in restricted and cancelled. |
| `organization_settings` | Starter | NONE | — | no | VIEW Owner/Manager. Allowed in restricted and cancelled. |
| `getting_started` | Starter | NONE | — | no | VIEW Owner/Manager/Cashier. Allowed in restricted and cancelled. |

Denial order, route statuses and page outcomes are `DENIAL_REASONS` and `DENIAL_ROUTE_STATUS` in `lib/entitlements/types.ts`. `decideSurfaceAccess` evaluates that order. `RECIPIENT_OPTED_OUT` is in the enum and is not produced.

Range horizons live in `lib/entitlements/range.ts`. Starter is today plus the previous 29 tenant-local dates. Growth starts on the first day of the month 12 calendar months earlier. Pro retains history. A Month-to-date preset that does not fit is rewritten to Last 30 days and is not a denial.
