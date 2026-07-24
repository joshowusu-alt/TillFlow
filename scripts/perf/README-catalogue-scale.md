# Catalogue scale benchmarks (Home recommendations)

Manual / nightly only — not part of default `npm test`.

## Purpose

Prove Home unused-catalogue / stock-setup-gap recommendations stay correct and
bounded as catalogue size grows (1k / 10k / 50k), with multi-branch history.

## Commands

```bash
# Correctness + local SQLite performance (after code changes)
npx tsx scripts/perf/catalogue-scale-bench.ts --sizes=1000 --iters=5
npx tsx scripts/perf/catalogue-scale-bench.ts --sizes=1000,10000 --iters=5
npx tsx scripts/perf/catalogue-scale-bench.ts --sizes=50000 --iters=3

# Seed only
npx tsx scripts/perf/catalogue-scale-bench.ts --sizes=1000 --seed-only
```

Results write to `tmp/catalogue-scale-bench-*.json` (gitignored via `tmp/`).

## Notes

- Uses synthetic tenants (`scale.*.@tillflow-test.invalid`), never production data.
- Local timings are SQLite-only; do not describe them as Ghana-network or Preview evidence.
- Re-run against isolated Preview Postgres after deploy for hosting-class numbers.
