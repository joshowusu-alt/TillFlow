'use server';

import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { withBusinessContext, safeAction, ok, err, type ActionResult } from '@/lib/action-utils';
import { audit } from '@/lib/audit';
import { ACTIVE_BUSINESS_COOKIE, SESSION_COOKIE_PREFIX } from '@/lib/business-scope';

export interface BackupData {
    version: string;
    exportedAt: string;
    business: any;
    stores: any[];
    users: any[];
    customers: any[];
    suppliers: any[];
    categories: any[];
    products: any[];
    units: any[];
    productUnits: any[];
    inventoryBalances: any[];
    accounts: any[];
    journalEntries: any[];
    journalLines: any[];
    salesInvoices: any[];
    salesInvoiceLines: any[];
    salesPayments: any[];
    salesReturns: any[];
    purchaseInvoices: any[];
    purchaseInvoiceLines: any[];
    purchasePayments: any[];
    purchaseReturns: any[];
    expenses: any[];
    expensePayments: any[];
    stockMovements: any[];
    stockAdjustments: any[];
    tills: any[];
    shifts: any[];
}

export async function exportDatabaseAction(): Promise<ActionResult<BackupData>> {
  return safeAction(async () => {
    const { businessId, user } = await withBusinessContext(['OWNER'], { requireWrite: false });

    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) return err('No business set up yet. Please complete onboarding first.');

        // Export all tables
        const [
            stores,
            users,
            customers,
            suppliers,
            categories,
            products,
            units,
            productUnits,
            inventoryBalances,
            accounts,
            journalEntries,
            journalLines,
            salesInvoices,
            salesInvoiceLines,
            salesPayments,
            salesReturns,
            purchaseInvoices,
            purchaseInvoiceLines,
            purchasePayments,
            purchaseReturns,
            expenses,
            expensePayments,
            stockMovements,
            stockAdjustments,
            tills,
            shifts
        ] = await Promise.all([
            prisma.store.findMany({ where: { businessId } }),
            prisma.user.findMany({ where: { businessId }, select: { id: true, businessId: true, name: true, email: true, role: true, active: true, createdAt: true } }),
            prisma.customer.findMany({ where: { businessId } }),
            prisma.supplier.findMany({ where: { businessId } }),
            prisma.category.findMany({ where: { businessId } }),
            prisma.product.findMany({ where: { businessId } }),
            prisma.unit.findMany({ where: { productUnits: { some: { product: { businessId } } } } }),
            prisma.productUnit.findMany({ where: { product: { businessId } } }),
            prisma.inventoryBalance.findMany({ where: { store: { businessId } } }),
            prisma.account.findMany({ where: { businessId } }),
            prisma.journalEntry.findMany({ where: { businessId } }),
            prisma.journalLine.findMany({ where: { journalEntry: { businessId } } }),
            prisma.salesInvoice.findMany({ where: { businessId } }),
            prisma.salesInvoiceLine.findMany({ where: { salesInvoice: { businessId } } }),
            prisma.salesPayment.findMany({ where: { salesInvoice: { businessId } } }),
            prisma.salesReturn.findMany({ where: { salesInvoice: { businessId } } }),
            prisma.purchaseInvoice.findMany({ where: { businessId } }),
            prisma.purchaseInvoiceLine.findMany({ where: { purchaseInvoice: { businessId } } }),
            prisma.purchasePayment.findMany({ where: { purchaseInvoice: { businessId } } }),
            prisma.purchaseReturn.findMany({ where: { purchaseInvoice: { businessId } } }),
            prisma.expense.findMany({ where: { businessId } }),
            prisma.expensePayment.findMany({ where: { businessId } }),
            prisma.stockMovement.findMany({ where: { store: { businessId } } }),
            prisma.stockAdjustment.findMany({ where: { store: { businessId } } }),
            prisma.till.findMany({ where: { store: { businessId } } }),
            prisma.shift.findMany({ where: { till: { store: { businessId } } } })
        ]);

        const backupData: BackupData = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            business,
            stores,
            users,
            customers,
            suppliers,
            categories,
            products,
            units,
            productUnits,
            inventoryBalances,
            accounts,
            journalEntries,
            journalLines,
            salesInvoices,
            salesInvoiceLines,
            salesPayments,
            salesReturns,
            purchaseInvoices,
            purchaseInvoiceLines,
            purchasePayments,
            purchaseReturns,
            expenses,
            expensePayments,
            stockMovements,
            stockAdjustments,
            tills,
            shifts
        };

    await audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'BACKUP_EXPORT',
      details: {
        exportedAt: backupData.exportedAt,
        productCount: products.length,
        salesCount: salesInvoices.length,
        purchaseCount: purchaseInvoices.length,
      },
    }).catch(() => {});

    return ok(backupData);
  });
}

export async function importDatabaseAction(backup: BackupData): Promise<ActionResult<{ message: string }>> {
  return safeAction(async () => {
    const { businessId, user } = await withBusinessContext(['OWNER']);

    if (!backup.version || !backup.business || !backup.exportedAt) {
      return err('The backup file is not in the right format. Please use a file exported from TillFlow.');
    }

    const users = Array.isArray(backup.users) ? backup.users : [];
    const hasOwner = users.some((u) => String(u?.role || '').toUpperCase() === 'OWNER');
    if (!hasOwner) {
      return err('Backup must include at least one owner user.');
    }

    const exportDate = new Date(backup.exportedAt);
    if (Number.isNaN(exportDate.getTime())) {
      return err('Backup export date is invalid.');
    }

    const list = <T = any>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

    // Pre-compute bcrypt hashes for users before opening the transaction (CPU-only, no DB).
    const userHashes = new Map<string, string>();
    for (const user of users) {
      userHashes.set(user.id, await bcrypt.hash(randomBytes(32).toString('hex'), 10));
    }

    // Atomic restore: wipe + re-insert in one transaction so a partial failure rolls back fully.
    await prisma.$transaction(async (tx) => {
      // Clear only this business data (multi-tenant safe) in FK-safe order.
      await tx.syncEvent.deleteMany({ where: { businessId } });
      await tx.dayClosure.deleteMany({ where: { businessId } });
      await tx.riskAlert.deleteMany({ where: { businessId } });
      await tx.cashDrawerEntry.deleteMany({ where: { businessId } });
      await tx.stockTransfer.deleteMany({ where: { businessId } });
      await tx.mobileMoneyStatusLog.deleteMany({ where: { collection: { businessId } } });
      await tx.salesPayment.deleteMany({ where: { salesInvoice: { businessId } } });
      await tx.mobileMoneyCollection.deleteMany({ where: { businessId } });
      await tx.journalLine.deleteMany({ where: { journalEntry: { businessId } } });
      await tx.journalEntry.deleteMany({ where: { businessId } });
      await tx.expensePayment.deleteMany({ where: { businessId } });
      await tx.expense.deleteMany({ where: { businessId } });
      await tx.stockAdjustment.deleteMany({ where: { store: { businessId } } });
      await tx.stockMovement.deleteMany({ where: { store: { businessId } } });
      await tx.salesReturn.deleteMany({ where: { salesInvoice: { businessId } } });
      await tx.salesInvoiceLine.deleteMany({ where: { salesInvoice: { businessId } } });
      await tx.salesInvoice.deleteMany({ where: { businessId } });
      await tx.purchasePayment.deleteMany({ where: { purchaseInvoice: { businessId } } });
      await tx.purchaseReturn.deleteMany({ where: { purchaseInvoice: { businessId } } });
      await tx.purchaseInvoiceLine.deleteMany({ where: { purchaseInvoice: { businessId } } });
      await tx.purchaseInvoice.deleteMany({ where: { businessId } });
      await tx.inventoryBalance.deleteMany({ where: { store: { businessId } } });
      await tx.stocktakeLine.deleteMany({ where: { stocktake: { store: { businessId } } } });
      await tx.stocktake.deleteMany({ where: { store: { businessId } } });
      await tx.productUnit.deleteMany({ where: { product: { businessId } } });
      await tx.product.deleteMany({ where: { businessId } });
      await tx.category.deleteMany({ where: { businessId } });
      await tx.shift.deleteMany({ where: { till: { store: { businessId } } } });
      await tx.till.deleteMany({ where: { store: { businessId } } });
      await tx.customer.deleteMany({ where: { businessId } });
      await tx.supplier.deleteMany({ where: { businessId } });
      await tx.account.deleteMany({ where: { businessId } });
      await tx.auditLog.deleteMany({ where: { businessId } });
      await tx.device.deleteMany({ where: { businessId } });
      await tx.branch.deleteMany({ where: { businessId } });
      await tx.organization.deleteMany({ where: { businessId } });
      await tx.session.deleteMany({ where: { user: { businessId } } });
      await tx.user.deleteMany({ where: { businessId } });
      await tx.store.deleteMany({ where: { businessId } });

      // Keep the same business row/id and restore settings into it
      await tx.business.update({
      where: { id: businessId },
      data: {
        name: backup.business.name ?? 'Restored Business',
        currency: backup.business.currency ?? 'GHS',
        plan:
          backup.business.plan ??
          (backup.business.mode === 'ADVANCED'
            ? backup.business.storeMode === 'MULTI_STORE'
              ? 'PRO'
              : 'GROWTH'
            : 'STARTER'),
        planStatus: backup.business.planStatus ?? 'ACTIVE',
        trialEndsAt: backup.business.trialEndsAt ? new Date(backup.business.trialEndsAt) : null,
        planSetAt: backup.business.planSetAt ? new Date(backup.business.planSetAt) : new Date(),
        planChangedByUserId: backup.business.planChangedByUserId ?? null,
        billingNotes: backup.business.billingNotes ?? null,
        vatEnabled: !!backup.business.vatEnabled,
        vatNumber: backup.business.vatNumber ?? null,
        mode: backup.business.mode ?? 'SIMPLE',
        receiptTemplate: backup.business.receiptTemplate ?? 'THERMAL_80',
        printMode: backup.business.printMode ?? 'DIRECT_ESC_POS',
        printerName: backup.business.printerName ?? null,
        receiptLogoUrl: backup.business.receiptLogoUrl ?? null,
        receiptHeader: backup.business.receiptHeader ?? null,
        receiptFooter: backup.business.receiptFooter ?? null,
        receiptShowVatNumber: backup.business.receiptShowVatNumber ?? true,
        receiptShowAddress: backup.business.receiptShowAddress ?? true,
        socialMediaHandle: backup.business.socialMediaHandle ?? null,
        address: backup.business.address ?? null,
        phone: backup.business.phone ?? null,
        tinNumber: backup.business.tinNumber ?? null,
        momoEnabled: backup.business.momoEnabled ?? false,
        momoProvider: backup.business.momoProvider ?? null,
        momoNumber: backup.business.momoNumber ?? null,
        openingCapitalPence:
          typeof backup.business.openingCapitalPence === 'number' ? backup.business.openingCapitalPence : 0,
        requireOpenTillForSales: backup.business.requireOpenTillForSales ?? false,
        discountApprovalThresholdBps:
          typeof backup.business.discountApprovalThresholdBps === 'number'
            ? backup.business.discountApprovalThresholdBps
            : 1500,
        varianceReasonRequired: backup.business.varianceReasonRequired ?? true,
        inventoryAdjustmentRiskThresholdBase:
          typeof backup.business.inventoryAdjustmentRiskThresholdBase === 'number'
            ? backup.business.inventoryAdjustmentRiskThresholdBase
            : 50,
        cashVarianceRiskThresholdPence:
          typeof backup.business.cashVarianceRiskThresholdPence === 'number'
            ? backup.business.cashVarianceRiskThresholdPence
            : 2000,
        customerScope: backup.business.customerScope ?? 'SHARED',
      },
    });

      // Units are global/shared: upsert so we never delete other businesses' units.
      for (const unit of list(backup.units)) {
        await tx.unit.upsert({
        where: { id: unit.id },
        update: {
          name: unit.name,
          pluralName: unit.pluralName,
          symbol: unit.symbol ?? null,
        },
        create: {
          id: unit.id,
          name: unit.name,
          pluralName: unit.pluralName,
          symbol: unit.symbol ?? null,
        },
        });
      }

      for (const store of list(backup.stores)) {
        await tx.store.create({ data: { ...store, businessId } });
      }

      for (const user of users) {
        const safeHash = userHashes.get(user.id)!;
        await tx.user.create({
          data: {
            ...user,
            businessId,
            passwordHash: safeHash
          }
        });
      }

      for (const customer of list(backup.customers)) {
        await tx.customer.create({ data: { ...customer, businessId } });
      }

      for (const supplier of list(backup.suppliers)) {
        await tx.supplier.create({ data: { ...supplier, businessId } });
      }

      for (const category of list(backup.categories)) {
        await tx.category.create({ data: { ...category, businessId } });
      }

      for (const product of list(backup.products)) {
        await tx.product.create({ data: { ...product, businessId } });
      }

      for (const pu of list(backup.productUnits)) {
        await tx.productUnit.create({ data: pu });
      }

      for (const account of list(backup.accounts)) {
        await tx.account.create({ data: { ...account, businessId } });
      }

      for (const till of list(backup.tills)) {
        await tx.till.create({ data: till });
      }

      for (const balance of list(backup.inventoryBalances)) {
        await tx.inventoryBalance.create({ data: balance });
      }

      for (const shift of list(backup.shifts)) {
        await tx.shift.create({ data: shift });
      }

      for (const invoice of list(backup.salesInvoices)) {
        await tx.salesInvoice.create({ data: { ...invoice, businessId } });
      }

      for (const line of list(backup.salesInvoiceLines)) {
        await tx.salesInvoiceLine.create({ data: line });
      }

      for (const payment of list(backup.salesPayments)) {
        // collectionId refs MobileMoneyCollection which is not included in the backup export,
        // so null it out to avoid FK constraint violation on restore.
        await tx.salesPayment.create({ data: { ...payment, collectionId: null } });
      }

      for (const ret of list(backup.salesReturns)) {
        await tx.salesReturn.create({ data: ret });
      }

      for (const invoice of list(backup.purchaseInvoices)) {
        await tx.purchaseInvoice.create({ data: { ...invoice, businessId } });
      }

      for (const line of list(backup.purchaseInvoiceLines)) {
        await tx.purchaseInvoiceLine.create({ data: line });
      }

      for (const payment of list(backup.purchasePayments)) {
        await tx.purchasePayment.create({ data: payment });
      }

      for (const ret of list(backup.purchaseReturns)) {
        await tx.purchaseReturn.create({ data: ret });
      }

      for (const expense of list(backup.expenses)) {
        await tx.expense.create({ data: { ...expense, businessId } });
      }

      for (const payment of list(backup.expensePayments)) {
        await tx.expensePayment.create({ data: { ...payment, businessId } });
      }

      for (const movement of list(backup.stockMovements)) {
        await tx.stockMovement.create({ data: movement });
      }

      for (const adjustment of list(backup.stockAdjustments)) {
        await tx.stockAdjustment.create({ data: adjustment });
      }

      for (const entry of list(backup.journalEntries)) {
        await tx.journalEntry.create({ data: { ...entry, businessId } });
      }

      for (const line of list(backup.journalLines)) {
        await tx.journalLine.create({ data: line });
      }
    }, { timeout: 60000, maxWait: 10000 });

    // Imported users have random temporary passwords and sessions were cleared.
    const cookieStore = cookies();
    cookieStore.getAll()
      .filter((cookie) => cookie.name.startsWith(SESSION_COOKIE_PREFIX))
      .forEach((cookie) => cookieStore.delete(cookie.name));
    cookieStore.delete(ACTIVE_BUSINESS_COOKIE);

    await audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'BACKUP_IMPORT',
      details: {
        importedFrom: backup.exportedAt,
        userCount: users.length,
        productCount: list(backup.products).length,
        salesCount: list(backup.salesInvoices).length,
        purchaseCount: list(backup.purchaseInvoices).length,
      },
    }).catch(() => {});

    return ok({
      message: `Restored backup from ${exportDate.toLocaleString()}. Users will need to reset their passwords and sign in again.`
    });
  });
}

/**
 * Wipe all transactional + product data but keep business, users, stores,
 * categories, units, accounts and tills so the owner can start fresh.
 */
export async function resetAllDataAction(): Promise<ActionResult<{ message: string }>> {
  return safeAction(async () => {
    const { businessId, user } = await withBusinessContext(['OWNER']);

    // Delete in reverse-dependency order
    await prisma.$transaction([
      // Journals
      prisma.journalLine.deleteMany({ where: { journalEntry: { businessId } } }),
      prisma.journalEntry.deleteMany({ where: { businessId } }),
      // Audit logs
      prisma.auditLog.deleteMany({ where: { businessId } }),
      // Expense payments & expenses
      prisma.expensePayment.deleteMany({ where: { businessId } }),
      prisma.expense.deleteMany({ where: { businessId } }),
      // Stock
      prisma.stockAdjustment.deleteMany({ where: { store: { businessId } } }),
      prisma.stockMovement.deleteMany({ where: { store: { businessId } } }),
      // Sales chain
      prisma.salesPayment.deleteMany({ where: { salesInvoice: { businessId } } }),
      prisma.salesReturn.deleteMany({ where: { salesInvoice: { businessId } } }),
      prisma.salesInvoiceLine.deleteMany({ where: { salesInvoice: { businessId } } }),
      prisma.salesInvoice.deleteMany({ where: { businessId } }),
      // Purchase chain
      prisma.purchasePayment.deleteMany({ where: { purchaseInvoice: { businessId } } }),
      prisma.purchaseReturn.deleteMany({ where: { purchaseInvoice: { businessId } } }),
      prisma.purchaseInvoiceLine.deleteMany({ where: { purchaseInvoice: { businessId } } }),
      prisma.purchaseInvoice.deleteMany({ where: { businessId } }),
      // Inventory & products
      prisma.inventoryBalance.deleteMany({ where: { store: { businessId } } }),
      prisma.productUnit.deleteMany({ where: { product: { businessId } } }),
      prisma.product.deleteMany({ where: { businessId } }),
      // Categories
      prisma.category.deleteMany({ where: { businessId } }),
      // Customers & suppliers
      prisma.customer.deleteMany({ where: { businessId } }),
      prisma.supplier.deleteMany({ where: { businessId } }),
      // Shifts (keep tills)
      prisma.shift.deleteMany({ where: { till: { store: { businessId } } } }),
    ]);

    // Audit the reset itself (the log table was just cleared, so this is the first entry)
    audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'DATA_RESET',
      details: { note: 'All transactional and product data wiped by owner' },
    });

    return ok({ message: 'All data has been reset. You can now add your real products and start fresh.' });
  });
}
