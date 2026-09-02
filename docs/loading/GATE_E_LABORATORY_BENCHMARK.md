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
| Gate E candidate | `fd7b32ac3a02c6c781c895f6f0bb4d1e4283e624` (product) / harness-only `f9fc0ed7` |

## Mobile portrait Slow-4G (final vs Production)

| Scenario | Production | Final | Change |
|---|---:|---:|---|
| Cold Home useful-shell | 1340 ms | 1152 ms | −14% |
| Warm Home useful-shell | 710 ms | 606 ms | −15% |
| Home → POS useful-shell | 1205 ms | 1075 ms | −11% |
| Home → POS checkout-ready | 1229 ms | 1084 ms | −12% |
| Direct POS useful-shell | 590 ms | 573 ms | −3% |
| Direct POS checkout-ready | 950 ms | 728 ms | −23% |
| Open POS click | 969 ms | 433 ms | −55% |
| Home CLS | 0 | 0 | budget met |
| Home → POS CLS | — | 0.002 | budget met |
| **Direct `/pos` CLS** | **0.85** | **0.80** | **FAIL (≥ 0.1)** |
| Landscape `/pos` CLS | 0.155 | 0.118 | **FAIL (≥ 0.1)** |

Layout JS +3.1 KB. Dual-nav: SSR ~901 bytes / 1 link; hydrates to a single navigation.

## Zero-write proof

Gate E `write-proof.json` compared SQLite counts before/after the bench. Sales invoices, stock movements, and purchase invoices were unchanged. Complete Sale remained disabled until selected till **and** open shift were ready.

## Follow-up

Gate F treats the direct `/pos` CLS failure as in-scope. See `docs/loading/GATE_F_POS_STABILITY.md` after the CSS-first POS fix is re-measured with the same harness.
