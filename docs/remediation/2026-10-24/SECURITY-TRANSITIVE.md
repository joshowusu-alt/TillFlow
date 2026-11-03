# Targeted transitive security follow-up

Parent snapshot:77902cf9391ba8629894884f0bed6643fa9461ab. This follow-up changes the lockfile within existing semver ranges; it adds no override, framework major, or production configuration change.

`npm update --package-lock-only --ignore-scripts undici source-map-js browserslist picomatch baseline-browser-mapping @babel/core`, then the same command for `resend`, resolves the remaining production dependency audit findings. The installed lock changes include Undici6.29.1 and7.30.1, source-map-js1.2.2, picomatch2.3.2 and4.0.7, browserslist4.29.4, baseline-browser-mapping2.11.32, Babel7.29.7, and Resend6.34.1. Resend's current same-major SDK removes the old Svix/uuid chain; no unsupported uuid major override is used.

## Applicability and vendor evidence

| Original residual | Actual application path / assessment | Vendor fixed floor |
|---|---|---|
| Undici high HTTP response/parser issues | Real storage upload/read transport through `lib/services/storage.ts` and `lib/services/migration/storage.ts` dynamically imports Vercel Blob. Third-party SDK responses are a reachable network boundary; patch rather than dismiss. The storefront's EventSource is browser-native, so that separate Node EventSource advisory is not demonstrated here. |6.29.1 /7.30.1 cover current vendor advisories|
| Picomatch high extglob ReDoS | Rollup/Vite/plugin glob processing uses repository/build patterns; no customer-controlled glob endpoint found. Still patch same major. |2.3.2 /4.0.4|
| source-map-js high indexed-map offsets DoS | PostCSS/source map tool chain; no application import of customer source maps found. Patch to avoid malformed dependency/build input. |1.2.2|
| Browserslist high stats parser and moderate cache exhaustion | Build/browser-target computation; no direct application API consumes customer browserslist queries or stats. Patch same major. |4.28.7|
| uuid moderate buffer bounds | Transitive Resend→Svix dependency, no direct app v3/v5/v6 buffer API use found. Actual mail paths are password reset and storefront OTP. Replace through supported Resend update. |11.1.1 upstream uuid floor; old chain removed|

Primary sources checked24October2026:

- https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c
- https://github.com/nodejs/undici/security/advisories/GHSA-4qv8-2p9j-2685
- https://github.com/micromatch/picomatch/security/advisories/GHSA-c2c7-rcm5-vvqj
- https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2
- https://github.com/browserslist/browserslist/security/advisories/GHSA-73wf-gq98-2v4g
- https://github.com/browserslist/browserslist/security/advisories/GHSA-c83g-rgw3-j3cx
- https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq

## Evidence

Node22.23.4; separate clean worktree and node_modules. `npm ci`:787packages installed successfully. `npm audit --omit=dev --json`:0critical,0high,0moderate,0low on this lockfile. This is a registry/advisory snapshot, not proof of application security.

The **full development dependency audit is not clean**:11 findings (3critical,5high,3moderate). These affect Vitest/coverage/mocker/tinypool, Vite, and ESLint/PostCSS build tooling (ajv, brace-expansion, flatted, js-yaml, minimatch, postcss-selector-parser). Production dependency closure above excludes these. Current test execution uses `vitest run`, without exposing a Vitest UI/API or development server. A separate tested tooling update remains required; some current fixes require Vitest4/tinypool2 API changes, so this production-runtime patch deliberately does not force incompatible transitive major versions. Do not expose development/test servers to untrusted networks or treat the production audit result as clearance of these tooling advisories.

`DATABASE_URL=file:./security-transitive.db npx vitest run lib/security/patched-email-runtime.test.ts lib/security/patched-image-runtime.test.ts lib/import/patched-spreadsheet.test.ts lib/services/storage.test.ts lib/services/migration/storage-vercel.test.ts`:23passed,0failed,0skipped across5files (4.48seconds). Focused tests use the actual SheetJS parser, sharp native image pipeline, real Resend SDK with intercepted fictional provider responses, and existing mocked storage contracts. Live mail/SMS/provider operations are not exercised. Combined production build, authenticated browser and PostgreSQL acceptance remain release gates; no production change is made here.
