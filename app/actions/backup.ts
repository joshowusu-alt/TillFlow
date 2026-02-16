'use server';

import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { withBusinessContext, safeAction, ok, err, type ActionResult } from '@/lib/action-utils';
import { audit } from '@/lib/audit';

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
    const { businessId } = await withBusinessContext(['OWNER']);

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

    return ok(backupData);
  });
}

export async function importDatabaseAction(backup: BackupData): Promise<ActionResult<{ message: string }>> {
  return safeAction(async () => {
    const { businessId } = await withBusinessContext(['OWNER']);

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

    // Clear only this business data (multi-tenant safe)
    await prisma.$transaction([
      prisma.journalLine.deleteMany({ where: { journalEntry: { businessId } } }),
      prisma.journalEntry.deleteMany({ where: { businessId } }),
      prisma.expensePayment.deleteMany({ where: { businessId } }),
      prisma.expense.deleteMany({ where: { businessId } }),
      prisma.stockAdjustment.deleteMany({ where: { store: { businessId } } }),
      prisma.stockMovement.deleteMany({ where: { store: { businessId } } }),
      prisma.salesPayment.deleteMany({ where: { salesInvoice: { businessId } } }),
      prisma.salesReturn.deleteMany({ where: { salesInvoice: { businessId } } }),
      prisma.salesInvoiceLine.deleteMany({ where: { salesInvoice: { businessId } } }),
      prisma.salesInvoice.deleteMany({ where: { businessId } }),
      prisma.purchasePayment.deleteMany({ where: { purchaseInvoice: { businessId } } }),
      prisma.purchaseReturn.deleteMany({ where: { purchaseInvoice: { businessId } } }),
      prisma.purchaseInvoiceLine.deleteMany({ where: { purchaseInvoice: { businessId } } }),
      prisma.purchaseInvoice.deleteMany({ where: { businessId } }),
      prisma.inventoryBalance.deleteMany({ where: { store: { businessId } } }),
      prisma.productUnit.deleteMany({ where: { product: { businessId } } }),
      prisma.product.deleteMany({ where: { businessId } }),
      prisma.category.deleteMany({ where: { businessId } }),
      prisma.shift.deleteMany({ where: { till: { store: { businessId } } } }),
      prisma.till.deleteMany({ where: { store: { businessId } } }),
      prisma.customer.deleteMany({ where: { businessId } }),
      prisma.supplier.deleteMany({ where: { businessId } }),
      prisma.account.deleteMany({ where: { businessId } }),
      prisma.session.deleteMany({ where: { user: { businessId } } }),
      prisma.user.deleteMany({ where: { businessId } }),
      prisma.store.deleteMany({ where: { businessId } }),
    ]);

    // Keep the same business row/id and restore settings into it
    await prisma.business.update({
      where: { id: businessId },
      data: {
        name: backup.business.name ?? 'Restored Business',
        currency: backup.business.currency ?? 'GHS',
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
      },
    });

    // Units are global/shared: upsert so we never delete other businesses' units.
    for (const unit of list(backup.units)) {
      await prisma.unit.upsert({
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
      await prisma.store.create({ data: { ...store, businessId } });
    }

    for (const user of users) {
      const safeHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
      await prisma.user.create({
        data: {
          ...user,
          businessId,
          passwordHash: safeHash
        }
      });
    }

    for (const customer of list(backup.customers)) {
      await prisma.customer.create({ data: { ...customer, businessId } });
    }

    for (const supplier of list(backup.suppliers)) {
      await prisma.supplier.create({ data: { ...supplier, businessId } });
    }

    for (const category of list(backup.categories)) {
      await prisma.category.create({ data: { ...category, businessId } });
    }

    for (const product of list(backup.products)) {
      await prisma.product.create({ data: { ...product, businessId } });
    }

    for (const pu of list(backup.productUnits)) {
      await prisma.productUnit.create({ data: pu });
    }

    for (const account of list(backup.accounts)) {
      await prisma.account.create({ data: { ...account, businessId } });
    }

    for (const till of list(backup.tills)) {
      await prisma.till.create({ data: till });
    }

    for (const balance of list(backup.inventoryBalances)) {
      await prisma.inventoryBalance.create({ data: balance });
    }

    for (const shift of list(backup.shifts)) {
      await prisma.shift.create({ data: shift });
    }

    for (const invoice of list(backup.salesInvoices)) {
      await prisma.salesInvoice.create({ data: { ...invoice, businessId } });
    }

    for (const line of list(backup.salesInvoiceLines)) {
      await prisma.salesInvoiceLine.create({ data: line });
    }

    for (const payment of list(backup.salesPayments)) {
      await prisma.salesPayment.create({ data: payment });
    }

    for (const ret of list(backup.salesReturns)) {
      await prisma.salesReturn.create({ data: ret });
    }

    for (const invoice of list(backup.purchaseInvoices)) {
      await prisma.purchaseInvoice.create({ data: { ...invoice, businessId } });
    }

    for (const line of list(backup.purchaseInvoiceLines)) {
      await prisma.purchaseInvoiceLine.create({ data: line });
    }

    for (const payment of list(backup.purchasePayments)) {
      await prisma.purchasePayment.create({ data: payment });
    }

    for (const ret of list(backup.purchaseReturns)) {
      await prisma.purchaseReturn.create({ data: ret });
    }

    for (const expense of list(backup.expenses)) {
      await prisma.expense.create({ data: { ...expense, businessId } });
    }

    for (const payment of list(backup.expensePayments)) {
      await prisma.expensePayment.create({ data: { ...payment, businessId } });
    }

    for (const movement of list(backup.stockMovements)) {
      await prisma.stockMovement.create({ data: movement });
    }

    for (const adjustment of list(backup.stockAdjustments)) {
      await prisma.stockAdjustment.create({ data: adjustment });
    }

    for (const entry of list(backup.journalEntries)) {
      await prisma.journalEntry.create({ data: { ...entry, businessId } });
    }

    for (const line of list(backup.journalLines)) {
      await prisma.journalLine.create({ data: line });
    }

    // Imported users have random temporary passwords and sessions were cleared.
    cookies().delete('pos_session');

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
    await audit({
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
