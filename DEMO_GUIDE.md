# TillFlow Demo Guide

Welcome to **TillFlow** — a complete Point of Sale system with inventory management,
double-entry accounting, and offline support. This guide walks you through the app
from first login to daily operations.

---

## Quick Start (2 minutes)

### 1. Login

| Role     | Email             | Password    |
|----------|-------------------|-------------|
| Owner    | owner@store.com   | Pass1234!   |
| Cashier  | cashier@store.com | Pass1234!   |

> **Owner** has full access. **Cashier** can only use POS, view products, and manage shifts.

### 2. Explore the Demo Data

The database is pre-loaded with:
- **21 products** across beverages, dairy, canned goods, toiletries, staples, and snacks
- **5 customers** (including a Walk-in Customer)
- **4 suppliers** (including a Default Supplier)
- **17 chart of accounts** entries for double-entry accounting
- **2 tills** and **2 user accounts**

---

## Feature Tour

### Point of Sale (`/pos`)

The POS is where you'll spend most of your time.

1. **Scan or search** — Type a product name or scan a barcode
2. **Quick-pick** — Frequently-sold items appear as buttons
3. **Multi-unit** — Sell by piece, pack, carton, or crate in one transaction
4. **Promotions** — Indomie Noodles has a "Buy 5 Get 1 Free" promo configured
5. **Split payment** — Pay part cash, part card, part mobile money
6. **Customer credit** — Assign a customer and sell on credit
7. **Keyboard shortcuts** — Press `F1` for barcode focus, `F2` to complete sale,  `Esc` to clear
8. **Offline mode** — Switch off your internet and the POS keeps working

### Inventory (`/inventory`)

- View real-time stock levels for all 21 products
- Stock adjustments (add/remove) with reason tracking
- Low-stock alerts when products drop below reorder point

### Products (`/products`)

- Full product catalogue with barcodes, SKUs, and prices
- Multi-unit support — each product can sell in multiple units (piece, carton, etc.)
- Configure promotions (buy X get Y free)
- Duplicate barcode prevention

### Customers (`/customers`)

- 5 demo customers pre-loaded
- Track customer purchase history
- Set credit limits for credit sales
- View account statements

### Suppliers (`/suppliers`)

- 4 demo suppliers pre-loaded
- Link suppliers to purchase invoices
- Track outstanding balances

### Purchases (`/purchases`)

Walk through a purchase flow:
1. Click **New Purchase** → select a supplier
2. Add products with quantities and costs
3. Choose payment: cash, card, or credit
4. Stock is automatically updated

### Sales Reports (`/reports/dashboard`)

- **Dashboard** — Today's sales, revenue, and top products
- **Analytics** (`/reports/analytics`) — Charts for sales trends, category breakdown
- **Margins** (`/reports/margins`) — Per-product margin analysis
- **Income Statement** (`/reports/income-statement`) — Full P&L report
- **Balance Sheet** (`/reports/balance-sheet`) — Assets, liabilities, equity
- **Cash Flow** (`/reports/cashflow`) — Cash in / out summary

### Expenses (`/expenses`)

- Record operating expenses (rent, utilities, salaries, etc.)
- Categorised by chart of accounts
- Partial payment support for credit expenses

### Shifts (`/shifts`)

Demonstrate shift management:
1. Open a shift on a till with an opening cash balance
2. Process a few sales
3. Close the shift — the system calculates expected cash vs actual cash and shows variance

### Settings (`/settings`)

- **Business info** — name, currency, VAT settings
- **Receipt design** — customise header, footer, logo
- **Printer setup** — ESC/POS thermal printing or browser printing
- **Backup/Restore** — download and restore full database backups

---

## Suggested Demo Scenarios

### Scenario 1: Quick Cash Sale (30 seconds)

1. Go to `/pos`
2. Search for "Coca-Cola" → click to add
3. Add "Indomie Noodles" × 6 (notice the promo discount)
4. Click **Complete Sale** → Cash
5. View the receipt

### Scenario 2: Credit Sale with Customer (1 minute)

1. Go to `/pos`
2. Click the customer selector → choose "Kofi Mensah"
3. Add several products
4. Complete sale → choose **Credit**
5. Go to `/customers` → click Kofi Mensah → view the outstanding balance

### Scenario 3: Purchase & Restock (1 minute)

1. Go to `/purchases` → **New Purchase**
2. Select "Coca-Cola Bottling" as supplier
3. Add "Coca-Cola 500ml" × 2 crates at cost
4. Pay by **Bank Transfer**
5. Go to `/inventory` → confirm stock increased

### Scenario 4: End of Day Reporting (1 minute)

1. Go to `/reports/dashboard` → view today's summary
2. Click **Analytics** → explore the charts
3. Check `/reports/income-statement` for the P&L
4. Export sales data from `/exports/sales`

### Scenario 5: Offline Resilience (1 minute)

1. Open `/pos` — process a sale
2. Disconnect from the internet (airplane mode or turn off WiFi)
3. Process another sale — it works offline!
4. Reconnect — sales auto-sync to the server

---

## Install as PWA

TillFlow works as a Progressive Web App on any device:

### Android / Chrome
1. Visit the app in Chrome
2. Tap the **Install** banner (or menu → "Install app")
3. TillFlow appears on your home screen like a native app

### iPhone / iPad / Safari
1. Visit the app in Safari
2. Tap the **Share** button → **Add to Home Screen**
3. TillFlow launches in full-screen mode

### Desktop (Chrome / Edge)
1. Visit the app
2. Click the install icon in the address bar (or the in-app **Install** button)
3. TillFlow opens in its own window

---

## Tips

- **Switch to Advanced Mode** in Settings to unlock full double-entry accounting views
- **Barcode scanning** works with any USB or Bluetooth barcode scanner — just plug in and scan
- **Cash drawer** is supported via USB (Web Serial API) — configure in Settings
- **Thermal receipt printing** via QZ Tray for ESC/POS printers
- **CSV exports** available for sales, purchases, products, and inventory

---

## Architecture (for developers)

| Layer       | Technology           |
|-------------|---------------------|
| Framework   | Next.js 14 (App Router) |
| Database    | SQLite (dev) / PostgreSQL (prod) |
| ORM         | Prisma               |
| Styling     | Tailwind CSS         |
| Charts      | Chart.js + react-chartjs-2 |
| Offline     | Service Worker + IndexedDB (via `idb`) |
| Printing    | ESC/POS via QZ Tray  |
| Auth        | Session-based with bcryptjs |
| Deployment  | Vercel               |

---

*Happy selling!* 🛒
