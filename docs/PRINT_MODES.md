# TillFlow Print Modes

TillFlow sends receipts and labels to two different classes of printer, and offers a **direct** path and a **browser** path for each. This document covers what each mode requires, what happens when things go wrong, and how to decide which mode to run in a given store.

## 1. Receipt printing

Controlled by `Business.printMode`. Two modes:

| Mode | What it does | What it requires | Recommended for |
|---|---|---|---|
| `DIRECT_ESC_POS` (default) | Generates ESC/POS bytes for the active sale, hands them to QZ Tray running on the same computer, which prints directly to the connected thermal printer with **no print dialog**. | A USB/serial thermal printer (most TillFlow stores use 80 mm thermal rolls). QZ Tray installed and running on the same Windows/Mac machine as the browser. Optional signing certificate at `/api/qz/certificate` for unsigned-print-prompt suppression. | Physical store counter running a Windows PC with a dedicated thermal printer. |
| `BROWSER_DIALOG` | Renders the receipt in the browser tab and calls `window.print()`, which opens the native print dialog. | Any printer the OS can see — including network printers, printer shares, and PDF printers. | Stores without a dedicated thermal printer, pop-up counters, and remote troubleshooting. |

### What happens on a receipt

1. POS completes the sale → redirect to `/receipts/<id>`.
2. The receipt page auto-runs one print attempt on mount:
   - `DIRECT_ESC_POS` → connect to QZ Tray, build ESC/POS bytes, send them.
   - `BROWSER_DIALOG` → `window.print()`.
3. If direct print fails, the receipt page surfaces an amber banner with the error and a **Retry Direct Print** button. The **Print Receipt** button (always visible) falls back to `window.print()` so no sale ever ends up with no receipt option.
4. Automation browsers (Playwright, Puppeteer) are detected via `navigator.webdriver` and skipped — CI never triggers a print dialog.

### Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| "QZ Tray is not running on this computer." | QZ Tray daemon is not started, or the websocket port is blocked. | Start QZ Tray on the till machine. Verify it's listening on `ws://localhost:8181`. |
| "Loading QZ Tray timed out." | `/api/qz/script` couldn't be loaded — usually a CSP, service-worker, or offline cache issue. | Check browser devtools network tab. See CSP audit below. |
| "The printer connection took too long." | Printer offline, out of paper, or stuck on a jam. | Physically check the printer. |
| Direct print failed with a certificate/signature warning dialog | The QZ signing certificate is missing or misconfigured. | See `app/api/qz/sign/route.ts` and `lib/qz-signing.server.ts`. TillFlow gracefully degrades to unsigned printing, which produces a user-visible QZ dialog on every print. |

### CSP note
Direct print loads `/api/qz/script` from our own origin — no external allowance needed. After the [CSP audit](../next.config.js), `connect-src 'self'` covers QZ's internal handshake. If you deploy to a subdomain and see CORS errors on `/api/qz/script`, that's a path/origin issue, not a CSP one.

## 2. Label printing

Controlled by `Business.labelPrintMode`. Two modes:

| Mode | What it does | What it requires | Recommended for |
|---|---|---|---|
| `BROWSER_PDF` (default) | Generates an HTML/CSS-laid-out label sheet, opens it in a new window, and calls `window.print()`. The user picks the printer in the OS dialog. | Any printer the OS can reach. For shelf tags and product stickers, most stores use a dedicated label printer picked in the dialog. For A4 sheets, any A4 printer works. | Stores that don't have a ZPL-capable label printer, or that print labels in bulk onto A4 sticker sheets. |
| `ZPL_DIRECT` | Sends raw ZPL (Zebra Programming Language) to the label printer via QZ Tray. Scaffolded but not yet the default path — see `lib/labels/zpl-generator.ts` when we finish that path. | A ZPL-capable printer (Zebra, Citizen, etc.) and QZ Tray on the same machine. | Stores with dedicated Zebra-style label printers doing continuous roll output. |

### Label sizes

| Size | Dimensions | Layout |
|---|---|---|
| `SHELF_TAG` | 50 × 30 mm | single label per page, compact shelf-edge tag |
| `PRODUCT_STICKER` | 60 × 40 mm | single label per page, detailed with barcode |
| `A4_SHEET` | 210 × 297 mm | 3 × 8 grid = 24 labels per sheet |

### Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| "Allow pop-ups for TillFlow..." | Browser blocked the print preview window. | Allow pop-ups for the TillFlow origin. |
| Labels render but barcode is missing or wrong | `lib/labels/barcode-generator.ts` couldn't detect a format for the barcode string. | Check the `barcode` field on the product; empty or non-numeric values skip barcode generation. |

## 3. Switching modes

Receipt print mode lives on `Business.printMode`. Set it via [/settings/receipt-design](../app/(protected)/settings/receipt-design/page.tsx) or a direct DB update. Default is `DIRECT_ESC_POS`.

Label print mode lives on `Business.labelPrintMode`. Default is `BROWSER_PDF`.

## 4. Telemetry

When a receipt or label print attempt resolves (success or failure), the client fires a non-blocking `POST /api/telemetry/print` with the mode, outcome, and (on failure) a sanitized error message. These events are written to the structured log (`lib/observability.appLog`) at `info` for successes and `warn` for failures, so ops can answer:

- "Which mode does store X actually use in practice?"
- "How often is QZ Tray failing for this store, and what's the error?"
- "Is a specific printer model disproportionately failing?"

No personally identifiable information is sent — only `{kind, mode, success, error, printerName}`. The endpoint requires a valid session cookie; it does **not** write to the database.
