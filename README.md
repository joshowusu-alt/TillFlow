# TillFlow

**Sales made simple.** A complete point of sale system with inventory management, accounting, and offline support.

![TillFlow Logo](./public/icon.svg)

## Features

✅ **Point of Sale** - Fast, intuitive checkout with barcode scanning  
✅ **Inventory Management** - Multi-unit tracking (e.g., "1 carton + 10 pieces")  
✅ **Double-Entry Accounting** - Income Statement, Balance Sheet, Cashflow  
✅ **Offline First** - Works without internet, syncs when back online  
✅ **PWA Ready** - Install as an app on any device  
✅ **Multi-Currency** - Supports 22+ currencies including GHS, NGN, KES  
✅ **Receipt Customization** - Custom headers, footers, and logo  
✅ **Advanced Analytics** - Sales trends, heatmaps, product performance

## Tech Stack

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Database:** Prisma + SQLite (portable, no server needed)
- **PWA:** Service Worker + IndexedDB for offline support

## Quick Start

```bash
npm install
npm run dev
```

The dev server automatically sets up and seeds the database.

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Owner | owner@demo.com | Pass1234! |
| Cashier | cashier@demo.com | Pass1234! |

## Key Pages

| Page | Description |
|------|-------------|
| `/pos` | Point of Sale terminal |
| `/products` | Product catalog management |
| `/inventory` | Stock levels and adjustments |
| `/reports/dashboard` | Business overview |
| `/reports/analytics` | Advanced analytics with charts |
| `/settings` | Business configuration |
| `/settings/backup` | Data export/import |
| `/onboarding` | Setup wizard for new users |

## Independent Installations

Each TillFlow installation is completely independent:

- Deploy to separate servers/computers
- Each has its own SQLite database  
- Zero data sharing between locations
- Perfect for franchises or unrelated businesses

---

**Made with ❤️ for small businesses everywhere.**
