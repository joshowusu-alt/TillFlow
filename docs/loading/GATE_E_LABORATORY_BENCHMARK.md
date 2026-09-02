# Gate E laboratory benchmark (sanitised)

Laboratory comparison only. Not field CrUX / Search Console CWV.
Never Production writes. Seed owner credentials are local-lab defaults and are not recorded here.

## Environment

- Node v24.14.1
- Chromium 149.0.7827.55
- OS: Windows 10 (build 26200)
- Network: Slow-4G proven (login TTFB ~55s)
- CPU 4× CDP throttle: **not honored** on this runner
- n = 5 measured samples + 1 warmup excluded
- Fixture: CI SQLite seed + `onboardingCompletedAt` + one OPEN shift; no runtime sales

## SHAs compared

| Label | SHA |
|---|---|
| Production | `8bd7d54e061aafae251100cff0e91c05bb666e77` |
| Phase 1 | `a344a233a83dc62a36be894d308c0f81dedbbf99` |
| Gate F candidate (measured POS) | `d3844c3ade8e41acea6a13758a1e4b23f7d0c6e7` |

## Mobile portrait Slow-4G (final vs Production)

| Scenario | Production | Final | Change |
|---|---:|---:|---|
| Cold Home useful-shell | 1253 ms | 1252 ms | ~0% |
| Warm Home useful-shell | 1039 ms | 961 ms | −8% |
| Home → POS useful-shell | 1603 ms | 1295 ms | −19% |
| Home → POS checkout-ready | 1623 ms | 1322 ms | −19% |
| Direct POS useful-shell | 767 ms | 714 ms | −7% |
| Direct POS checkout-ready | 1828 ms | 976 ms | −47% |
| Open POS click | 1111 ms | 646 ms | −42% |
| Home CLS | 0 | 0 | budget met |
| Home → POS CLS | 0 | 0.031 | budget met (< 0.1) |
| **Direct `/pos` CLS** | **0.853** | **0.063** | **PASS (< 0.1)** |

Direct `/pos` CLS range: Production 0.852–0.853; final 0.063–0.063 (n=5, median=p75).

## Mobile landscape Slow-4G (final vs Production)

| Scenario | Production | Final | Change |
|---|---:|---:|---|
| Direct `/pos` CLS | 0.156 | 0 | **PASS (< 0.1)** |
| Direct `/pos` useful-shell | 887 ms | 797 ms | −10% |
| Direct `/pos` checkout-ready | 1928 ms | 1164 ms | −40% |
| Home → POS CLS | 0.017 | 0 | budget met |
| Home → POS useful-shell | 1603 ms | 1621 ms | +1% (not material) |
| Home → POS checkout-ready | 1723 ms | 1653 ms | −4% |

Direct landscape `/pos` CLS range: Production 0.154–0.189; final 0–0.

## Desktop unthrottled (final vs Production)

| Scenario | Production | Final | Change |
|---|---:|---:|---|
| Direct `/pos` CLS | 0.124 | 0 | **PASS (< 0.1)** |
| Direct `/pos` useful-shell | 110 ms | 98 ms | −11% |
| Direct `/pos` checkout-ready | 155 ms | 103 ms | −34% |
| Home → POS CLS | 0.007 | 0 | budget met |

Desktop LCP medians rose (about 176 ms → 344 ms on direct `/pos`) while remaining well under 2.5 s. Useful-shell and checkout-ready improved. Not a CLS budget failure.

## Earlier Home / route improvements

Portrait warm Home, products, and purchases useful-shell stayed at or better than Production. Reports useful-shell +7% (below the 10% median regression rule). Shifts useful-shell ~0%; Shifts LCP +23% (704 → 864 ms) is recorded and is not a POS CLS miss.

Layout JS: `/pos` first-load 39.1 kB Production → 39.3 kB candidate. Dual-nav remains a single navigation after hydrate.

## Zero-write proof

Gate E compared SQLite counts before/after the bench on all three SHAs. Sales invoices 0→0, stock movements 0→0, purchase invoices 0→0, shifts 1 OPEN unchanged. Complete Sale remained disabled until selected till **and** open shift were ready.

## Follow-up

Gate F CSS-first POS is the measured candidate above. Element-level attribution and architecture: `docs/loading/GATE_F_POS_STABILITY.md`.
