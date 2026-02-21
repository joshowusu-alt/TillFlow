# Phase 4 — Visual Regression Checklist

Review each screen below after any Phase 4 change to confirm the enterprise design is intact and no Phase 2/3 functionality has regressed.

---

## Quick checks (run after any design change)

```bash
npm test          # All 18 unit tests must PASS
npm run build     # Zero build errors
# Then open /qa   # Full QA suite must show PASS
```

---

## Screen-by-screen checklist

### Navigation (TopNav)
- [ ] Logo: "Till" in emerald, "Flow" in gray-700 — brand preserved
- [ ] Active nav item: **indigo/blue** (`bg-accent`) background — not teal
- [ ] Dropdown menus: clean white, `rounded-xl` corners, soft shadow
- [ ] Trust panel (desktop): user name + online dot + role · store name
- [ ] Online dot: **green** when online, **red** when offline
- [ ] Mobile menu: user info panel shows name, role, branch, online badge

### POS Screen (`/pos`)
- [ ] Page loads with product grid and cart panel
- [ ] Cart empty state is accessible with guidance text
- [ ] Add-to-cart feedback is visible (< 200ms)
- [ ] Payment button uses `btn-primary` (indigo, not teal)
- [ ] Money totals are bold, tabular-nums, clearly readable
- [ ] Offline sale: "You're offline — sales will be saved locally" toast appears
- [ ] Synced: "N sales synced" success toast appears after reconnect

### Payments (`/payments/*`)
- [ ] MoMo Reconciliation page renders correctly
- [ ] Status pills: paid=emerald, unpaid=red, part-paid=amber
- [ ] Table rows have hover highlight, sticky header where applicable
- [ ] Form inputs have proper focus ring (indigo, 2px)

### Reports Dashboard (`/reports/dashboard`)
- [ ] StatCards use new border/shadow (no heavy `rounded-2xl bg-white/90`)
- [ ] Stat values are bold, tabular-nums, color-coded by tone
- [ ] Success/positive values show in emerald, negatives in red
- [ ] Chart labels are readable at sm breakpoint

### Exports (`/reports/exports` or `/exports`)
- [ ] Export buttons use `btn-primary` or `btn-secondary`
- [ ] Loading states show spinner correctly

### System Health (`/settings/system-health` or `/qa`)
- [ ] QA full suite shows **PASS** on all checks
- [ ] Error states use red-50/red-700 (new error token), not old rose

### /qa page
- [ ] All checks return PASS
- [ ] No visual artifacts or encoding glitches in labels

### Onboarding Wizard (`/onboarding`)
- [ ] Background gradient: blue-50 → white → indigo-50 (not green)
- [ ] Progress bar: indigo gradient (not emerald/teal)
- [ ] Step 1 icon: indigo circle (not emerald)
- [ ] Step CTAs: `btn-primary` (indigo, not teal)
- [ ] "Skip setup" link visible and functional
- [ ] Completing wizard redirects to `/pos`

### Settings (`/settings`)
- [ ] Form inputs: `rounded-lg`, gray-200 border, indigo focus ring
- [ ] "Setup Guide" card links to `/onboarding` for restart
- [ ] Save button: `btn-primary` (indigo)
- [ ] Section cards: `rounded-xl`, gray-200 border, white bg

### Toast Notifications
- [ ] Success toast: emerald background + checkmark icon
- [ ] Error toast: red background + X icon
- [ ] Info toast: dark/ink background + info icon
- [ ] All toasts animate in from right (< 250ms)
- [ ] Toasts accessible: `role="status"`, `aria-live="polite"`
- [ ] With OS "Reduce Motion": animations disabled

### Offline/Sync Status Pill
- [ ] Offline: red pill, "Offline / Sales saved locally"
- [ ] Pending: amber pill, "N pending / Tap to sync"
- [ ] Syncing: blue pill, spinner, "Syncing…"
- [ ] Details panel: shows pending count, last sync result
- [ ] Online + no pending: pill hidden (zero UI noise)

---

## Colour token reference

| Token         | Value     | Usage                          |
|---------------|-----------|--------------------------------|
| `accent`      | `#1E40AF` | Primary CTAs, nav active, focus |
| `success`     | `#059669` | Profit, synced, positive       |
| `amber`       | `#D97706` | Warnings, low stock            |
| `rose`        | `#DC2626` | Errors, negative amounts       |
| `paper`       | `#F8FAFC` | Page background                |
| `ink`         | `#111827` | Primary body text              |
| `muted`       | `#6B7280` | Secondary / helper text        |
| `border`      | `#E5E7EB` | Default border                 |

---

## WCAG AA contrast checks (key pairs)

| Foreground     | Background   | Ratio | Pass? |
|----------------|--------------|-------|-------|
| `#111827` text | `#F8FAFC` bg | ~18:1 | ✓     |
| `#FFFFFF`      | `#1E40AF`    | ~8:1  | ✓     |
| `#FFFFFF`      | `#059669`    | ~4.6:1| ✓     |
| `#FFFFFF`      | `#DC2626`    | ~5.9:1| ✓     |
| `#6B7280`      | `#FFFFFF`    | ~4.6:1| ✓     |

---

_Last updated: Phase 4 implementation — February 2026_
