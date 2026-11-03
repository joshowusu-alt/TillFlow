# Security and runtime remediation — review branch

Baseline tree: PR144 (6452dab7dff03e8c52921476cba6061950944df2). No production deployment or configuration change.

## Controlled dependency changes

| Dependency | Previous | Prepared version | Reason |
|---|---|---|---|
| next / eslint-config-next |14.2.35|15.5.28|Patched Server Actions DoS and image-optimizer advisory; matching ESLint integration|
| sharp |0.34.5|0.35.5|Vendor image-library security floor|
| xlsx |0.18.5|0.20.3 official SheetJS CDN tarball|Patched spreadsheet ReDoS; exact URL and SHA512 integrity in lockfile|
| @sentry/nextjs |10.43.0|10.75.2|Same-major tunnel middleware-bypass fix; tunnel option is not configured here|
| fflate |0.8.2|0.8.3|Malformed ZIP64 bounds/infinite-loop patch|
| zod |4.3.6|4.6.6|Constrained collection memory exhaustion patch; vulnerable collection usage not demonstrated in this app|
| postcss |root8.5.6 / Next nested8.4.x|8.5.23|CSS source-map traversal corrections; scoped Next child override|

React18.2 is retained: installed Next15.5.28 explicitly accepts it in peerDependencies. The current vendor upgrade guide recommends React19 for App Router; **successful real App Router/Server Action browser acceptance on this exact stack remains a release gate**, not inferred from peer metadata.

## Compatibility changes

The official next-async-request-api codemod was applied, then reviewed. Unrelated tishgroup-control changes were reverted. Page/route params and searchParams now resolve Promises; route tests pass promised params. Auth/session cookie and header operations, OTP cookie mutations, and Home cookie hints await request APIs. Redirect-error imports use the Next15 module location. NextRequest.ip was removed by Next15, so existing forwarded/real-IP headers remain the source. The external packages setting moved to stable serverExternalPackages.

Two existing deliberately synchronous helpers keep the documented Next15 UnsafeUnwrapped compatibility adapter: operational-store-cookie and observability request-ID. The store helper preserves its existing fail-closed contract. Do not move to Next16 until these adapters are converted. No unsafe app authentication bypass was added.

New ESLint integration reported existing plain internal anchors; those now use Link (test-only same-page anchor remains a fragment). No feature redesign.

## Executed evidence so far

- Initial controlled dependencies install succeeded on Node22.23.4. Exact package lock integrity is recorded.
- Standalone TypeScript passed after async/moved-export corrections; lint passed with only two inherited POS hook warnings.
- Three real parser/native-image regressions passed: actual SheetJS stock workbook import, branded financial workbook roundtrip, controlled native sharp SVG-to-PNG conversion.
- Focused auth/financial/offline/parser subset:114passed across eight files.
- Additional Promise-based auth/expired-session cleanup and operational-cookie contract subset:11passed across two files.
- First Next15 production build compiled successfully, then generated-page validation caught one unused legacy variance-page query signature; removed unused prop. Final build rerun pending.
- A full unit run is in progress on the initial Next/sharp/SheetJS versions. Final dependency clean-install/build and combined CI/browser acceptance remain pending; do not claim completed certification from this document.
- Lock audit after added same-major patches:0critical,4high,4moderate,1low. Remaining transitive advisories require applicability review; no claim of a clean dependency audit.

## Primary sources checked24October2026

- https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r
- https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw
- https://nextjs.org/docs/app/guides/upgrading/version-15
- https://cdn.sheetjs.com/advisories/CVE-2024-22363
- https://docs.sheetjs.com/docs/getting-started/installation/nodejs/
- https://github.com/getsentry/sentry-javascript/security/advisories/GHSA-mchm-gjx6-7h55
- https://github.com/101arrowz/fflate/releases/tag/v0.8.3
- https://github.com/postcss/postcss/security/advisories/GHSA-fxqj-rqcc-2cmp

Production project runtime setting remains unchanged. Package/.nvmrc/CI already pin22 in PR144. Before a release, verify effective Vercel runtime and reconcile the24.x project setting only with founder approval. No PostgreSQL schema migration is introduced.
