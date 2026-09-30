# Stage 3A experience correction

This note records what the customer screen does after the experience correction, and what Stage 3B still has to finish. It does not change entitlements.

## Sales Analytics and Trading

`TRADING_COVERS_SALES_ANALYTICS` is false. Growth and Pro keep Sales Analytics in Activity. Starter does not receive it. Neither route is deleted or redirected.

| Capability | Sales Analytics today | Trading today | Approved future Trading |
| --- | --- | --- | --- |
| Date ranges | 7, 14, 30, 90 days | Today, last 7 days, custom | A period the customer chooses, including last week |
| Sales totals | Revenue for the period | Sales revenue for the period | Same |
| Product and category | Category chart and top products | Best-selling products. No category chart | Products, and the category view Analytics has now |
| Discounts | Line discounts are mentioned. There is no discount total | No discount total | Discounts for the period |
| Returns | Not shown | Returns and voids in the period | Returns |
| Profit and margin | Gross profit and margin, withheld when costs are incomplete | Gross and net profit, withheld when costs are incomplete | Profit when costs are complete |
| Payment methods | Not shown | Confirmed receipts by method | Payment patterns |
| Branch scope | The stores the decision allows. No branch picker on the page | Named branch, or Pro consolidated | Same as the decision |
| Comparison | This period against the previous one | No previous-period chart | Comparison the plan allows |
| Export | No file on the page | No analytics file on the page | Not a reason to hide Analytics |
| Growth and Pro | Growth and Pro | All plans. Consolidation is Pro | Trading remains. Analytics leaves only after the rows above match |

Stage 3B still has to bring into Trading, using the existing calculations rather than a second copy:

- category breakdown
- hourly pattern and peak hour
- previous-period comparison
- average sale value
- a discounts total
- 14-day and 90-day presets

Until that list is empty, Activity shows both Trading and Sales Analytics for Growth and Pro.

## Shell banners

Getting ready and the trial or billing banner are global. There is no supported collapsed pattern that can be applied only on Reports without redesigning the shell. This correction does not hide them. The Reports empty state does not repeat setup steps.

## Scope

The report chip is either one branch name or `Consolidated — all branches`. On Reports, the header till is labelled Till so it is not a second report scope, and the business-wide “Today · All branches” chip is not shown. A branch switch rewrites a report URL onto the new store id so the next query cannot keep the previous one.

## Review surface

`/reviews/reports-stage3a` renders in Preview and local development. Production middleware returns 404 before login. The page uses the same Today, Activity and More presentation with labelled sample data. It does not query a business, and it cannot change records, send messages or export files. `/reports` stays on live data only.
