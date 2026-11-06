# Tish Group mobile UI checks

Run from `tishgroup-control`:

```sh
npm ci
npx playwright install --with-deps chromium
node scripts/check-mobile-ui.mjs
```

The runner starts a temporary copy of the real Next app, including the root layout and bundled fonts. Only authentication, business data, collections history and server actions are replaced with synthetic fixtures. Database connection URLs are cleared and fixture mutations throw. It exercises the real search API against fixture data. Production authentication, records and billing are never used.

The suite checks 19 views (including the growth detail modal) across all 14 navigation areas and account tabs, at ten viewport sizes (320–1440px), including landscape and a reduced-height keyboard-sized viewport. It rejects document/content overflow and undersized input text; checks menu focus, Escape, desktop resize, role-sensitive navigation, account tabs, search success/empty/failure states, and bulk selection. Axe checks WCAG A/AA rules for serious/critical findings at phone width. Screenshots and JSON results go to `/tmp/tish-mobile-results` by default; set `UI_TEST_OUTPUT` to change that. CI retains these as an artifact.

For an existing compatible Chromium binary, set `CHROMIUM_EXECUTABLE_PATH`. `UI_TEST_PORT` defaults to 3192. To inspect the fixture manually, run `node scripts/mobile-ui-fixture.mjs` (default port 3191).

These are browser-emulated viewport checks using synthetic records. They do not establish production uptime, a percentage reliability guarantee, physical iPhone/Safari behavior, or successful financial mutations. Release validation must keep those distinctions explicit.
