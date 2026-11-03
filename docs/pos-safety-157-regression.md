# PR 157 pos-safety regression

Failed run: https://github.com/joshowusu-alt/TillFlow/actions/runs/40942113690
Failed job: 123690028410, step Offline sync smoke E2E.

The job log reports stage `pos-ready`: login succeeded, but there were no till controls or checkout buttons. The test had not reached sale creation or offline-sync submission. The artifact ZIP was inspected: the upload omitted `.ci-server.log` and `.playwright-mcp` failure images because hidden-file inclusion was disabled and the screenshot directory was not listed. Reports layout fixtures passed because they do not mount the operational cashier POS.

Reproduced against the previous head's local production build and a new local SQLite seed. A screenshot showed the protected generic error screen on /pos. Browser pageerror instrumentation exposed:

> PrismaClient is unable to run in this browser environment

Stack: client chunk module 52918 (lib/prisma) executes `$use` → module 22634 (shared services barrel) → POS client cart pricing imports. The barrel exports inventory utilities that import Prisma. Before the middleware addition, browser construction returned Prisma's browser stub without touching its properties; registering `$use` eagerly accessed that stub and threw. This is a deterministic module-boundary regression, not an offline-sync error-shape failure or active-polling race.

Fix: use the pure `lib/services/shared/product-unit-pricing` module directly in POS cart pricing and the other affected client surfaces (sale amendment, opening-stock setup, offline sale recovery). Keep database middleware server behaviour unchanged. Add a browser-bundle regression test asserting that POS cart pricing does not import Prisma or inventory utilities. No smoke assertions, financial assertions, workflow ordering or timeouts were relaxed.

Separately, normal P2xxx query/constraint errors now bypass outage classification entirely, including quota/402 text, HTTP status and nested causes. Explicit P2024 pool timeout detection remains intact. Tests preserve original P2002/P2010/P2021/P2022 error identity through runDatabaseOperation.

Diagnostics: upload the server log and offline-smoke images with hidden files enabled; record browser page errors in the smoke log/failure report. CI must finish Offline sync smoke, Route speed, Deep owner-flow E2E, Phase 3A financial QA and UI shell geometry on the new head. A green build or unit job alone is insufficient evidence.
