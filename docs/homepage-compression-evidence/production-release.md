# TillFlow homepage production release

LIVE AND VERIFIED. The homepage redesign workstream is closed following the founder's explicit approval of the exact release.

## Live release

- Exact live SHA: `56fe0019771546cb509e2ba964f05e0622e6efc9`.
- Project: `supermarket-pos` (`prj_Ndxzi9vvY6R5MMDPZYGe3GwkNcli`).
- Deployment: `dpl_9noviyEPnDbQeJCTpxH262yLGkdC`, READY, production.
- [Production homepage](https://www.tillflow.app/welcome).
- [Exact deployment](https://supermarket-43f8grhlp-joshua-owusus-projects.vercel.app).
- Both `www.tillflow.app` and `tillflow.app` are assigned to this deployment. The bare domain redirects to the canonical www domain.

## Preflight and fallback

Before release, production was reconfirmed at `5ad596eb38cb9449542669c210639a38179146cf`, on `dpl_ESTwt1BkViSTvGBCRj6TNH16vXBm`. Both domains returned healthy status with the database up. The deployment was READY and rollback eligible. The repository and PR head matched the approved SHA, and all final CI and PostgreSQL smoke gates were green.

The same fallback remains READY and rollback eligible after release. No critical regression occurred and no rollback was needed.

The production build log confirms `npm ci`, Prisma client generation and Next compilation. It contains no migration, schema-push or seed command. No project configuration or Secrets were changed.

## Post deployment verification

| Check | Result |
|---|---|
| Production identity and both domain assignments | Approved SHA, READY, correct project |
| Both-domain homepage at 320, 360, 390, 768 and 1440px | 10 checks; six sections, no overflow or browser errors |
| Public routes at all five widths | 50 route/width checks; no runtime errors or page overflow |
| Homepage accessibility collapsed and expanded | Zero automated WCAG A/AA violations at every checked width |
| Demo overview, dashboard, sale, inventory, reports, customers and storefront | Load successfully |
| Pricing and plan links | Monthly GH₵199/349/699; annual GH₵1,990/3,490/6,990; all three plan destinations correct |
| Registration navigation | Pro and annual selection preserved through local UI screens; no account created |
| WhatsApp | Correct +233 54 701 6160 destination; no message sent |
| Social links | One Facebook and one TikTok footer link with supplied destinations and safe new-tab attributes |
| Media and fonts | Poster, video, captions and font return 200 on both domains; no initial MP4 download before playback |
| Health | 200, healthy, database up on both domains |
| Existing app access | POS, onboarding and products continue to require sign-in |
| Runtime logs | No error/fatal records for this deployment during verification; info records observed |

The customer proof reads: “Used at EL-SHADDAI Supermarket.” It describes sales, barcode scanning, receipts, offline POS, stock and financial management. It contains no paying-customer, subscription or complimentary-access claim.

The unchanged login contrast and tablet demo-inventory keyboard findings match the pre-release production baseline. Automated social profile-content verification remains limited by external platform access restrictions; the founder-supplied link markup is confirmed. Physical iPhone/Safari and conversion uplift are not certified by these browser checks.

## Data preservation and closure

PRs 176 and 177 remain OPEN and unmerged. No migrations, Secret changes, live account creation, live financial writes or offline-queue manipulation were performed. Verification blocked server-write requests and used no customer session. The release changes only the reviewed homepage presentation and marketing files.

The live page retains the measured 61.1% desktop and 66.1% mobile height reductions. The next priority is customer acquisition, demonstrations, subscriptions and revenue. No further general homepage redesign is part of this workstream.

## Evidence

- [Raw route and control checks](production-validation.json).
- [Both-domain proof, assets and health](production-domains-assets-health.json).
- [Platform identity, fallback and runtime logs](production-platform-verification.json).
- [Desktop screenshot](production-www-1440.webp).
- [Mobile screenshot](production-www-390.webp).
- [Release record](release-record.json).
