# Reports Today preview refinement

Preview only. Production release requires Joshua’s review and acceptance of Today.

The existing authorised Today snapshot and calculations remain the source of truth.
The overview now includes estimated gross profit when the plan permits it and all
recorded sale costs are available. Missing costs withhold profit; omitted profit
stays omitted. Gross profit is explicitly before operating expenses.

Needs attention retains the existing priority order and authorised destinations:
the first three checks are visible, with the remaining loaded checks under More
checks. The loader still returns at most five; this is not a complete issue queue.
Pending payment checks retain their cross-date disclosure.

Payment methods and top products are expandable. The existing 30-day comparison
is a separate expandable section, so it is not confused with today’s performance.
Yesterday is labelled as a full-day total. Mobile has a smaller sales headline
and visible last-updated time. Exact amounts, negative payment handling, branch
scope and date-scoped drilldowns retain their existing behaviour.

Verification: Today unit, presentation, accessibility and entitlement tests; type
checking; local browser review on laptop and phone with healthy, attention,
partial, missing-cost and empty fixtures, plus the real local report route.

Final layout pass: the seven-day chart spans both desktop columns below the
overview and checks. Horizontal bars show each exact daily amount and date
without expansion, including signed negative values on a shared zero point.
The exact daily table remains expandable. No-sales cards use reduced spacing.

Owner-selected chart: vertical bars replace the horizontal draft. Each day is a
keyboard- and touch-accessible button; selection shows its exact amount and date.
A labelled currency scale, zero baseline and signed negative bars preserve scale.
The full-width desktop placement and expandable exact daily table remain.
