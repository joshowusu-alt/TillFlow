'use server';

import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';

export interface BackupData {
    version: string;
    exportedAt: string;
    business: any;
    stores: any[];
    users: any[];
    customers: any[];
    suppliers: any[];
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

export async function exportDatabaseAction(): Promise<{ success: true; data: BackupData } | { success: false; error: string }> {
    try {
        await requireRole(['OWNER']);

        const business = await prisma.business.findFirst();
        if (!business) {
            return { success: false, error: 'No business found' };
        }

        // Export all tables
        const [
            stores,
            users,
            customers,
            suppliers,
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
            prisma.store.findMany({ where: { businessId: business.id } }),
            prisma.user.findMany({ where: { businessId: business.id }, select: { id: true, businessId: true, name: true, email: true, role: true, active: true, createdAt: true } }), // Exclude passwordHash
            prisma.customer.findMany({ where: { businessId: business.id } }),
            prisma.supplier.findMany({ where: { businessId: business.id } }),
            prisma.product.findMany({ where: { businessId: business.id } }),
            prisma.unit.findMany(),
            prisma.productUnit.findMany(),
            prisma.inventoryBalance.findMany(),
            prisma.account.findMany({ where: { businessId: business.id } }),
            prisma.journalEntry.findMany({ where: { businessId: business.id } }),
            prisma.journalLine.findMany(),
            prisma.salesInvoice.findMany({ where: { businessId: business.id } }),
            prisma.salesInvoiceLine.findMany(),
            prisma.salesPayment.findMany(),
            prisma.salesReturn.findMany(),
            prisma.purchaseInvoice.findMany({ where: { businessId: business.id } }),
            prisma.purchaseInvoiceLine.findMany(),
            prisma.purchasePayment.findMany(),
            prisma.purchaseReturn.findMany(),
            prisma.expense.findMany({ where: { businessId: business.id } }),
            prisma.expensePayment.findMany({ where: { businessId: business.id } }),
            prisma.stockMovement.findMany(),
            prisma.stockAdjustment.findMany(),
            prisma.till.findMany(),
            prisma.shift.findMany()
        ]);

        const backupData: BackupData = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            business,
            stores,
            users,
            customers,
            suppliers,
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

        return { success: true, data: backupData };
    } catch (error) {
        console.error('Export error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Export failed' };
    }
}

export async function importDatabaseAction(backup: BackupData): Promise<{ success: true; message: string } | { success: false; error: string }> {
    try {
        await requireRole(['OWNER']);

        // Validate backup structure
        if (!backup.version || !backup.business || !backup.exportedAt) {
            return { success: false, error: 'Invalid backup file format' };
        }

        // Clear existing data (in reverse order of dependencies)
        await prisma.$transaction([
            prisma.journalLine.deleteMany(),
            prisma.journalEntry.deleteMany(),
            prisma.expensePayment.deleteMany(),
            prisma.expense.deleteMany(),
            prisma.stockAdjustment.deleteMany(),
            prisma.stockMovement.deleteMany(),
            prisma.salesPayment.deleteMany(),
            prisma.salesReturn.deleteMany(),
            prisma.salesInvoiceLine.deleteMany(),
            prisma.salesInvoice.deleteMany(),
            prisma.purchasePayment.deleteMany(),
            prisma.purchaseReturn.deleteMany(),
            prisma.purchaseInvoiceLine.deleteMany(),
            prisma.purchaseInvoice.deleteMany(),
            prisma.inventoryBalance.deleteMany(),
            prisma.productUnit.deleteMany(),
            prisma.product.deleteMany(),
            prisma.unit.deleteMany(),
            prisma.shift.deleteMany(),
            prisma.till.deleteMany(),
            prisma.customer.deleteMany(),
            prisma.supplier.deleteMany(),
            prisma.account.deleteMany(),
            prisma.session.deleteMany(),
            prisma.user.deleteMany(),
            prisma.store.deleteMany(),
            prisma.business.deleteMany()
        ]);

        // Import data in dependency order
        // Business
        await prisma.business.create({ data: backup.business });

        // Stores
        for (const store of backup.stores) {
            await prisma.store.create({ data: store });
        }

        // Users (without password - they'll need to reset)
        for (const user of backup.users) {
            await prisma.user.create({
                data: {
                    ...user,
                    passwordHash: '$2a$10$placeholder' // Placeholder hash, user needs to reset password
                }
            });
        }

        // Units
        for (const unit of backup.units) {
            await prisma.unit.create({ data: unit });
        }

        // Customers
        for (const customer of backup.customers) {
            await prisma.customer.create({ data: customer });
        }

        // Suppliers
        for (const supplier of backup.suppliers) {
            await prisma.supplier.create({ data: supplier });
        }

        // Products
        for (const product of backup.products) {
            await prisma.product.create({ data: product });
        }

        // Product Units
        for (const pu of backup.productUnits) {
            await prisma.productUnit.create({ data: pu });
        }

        // Accounts
        for (const account of backup.accounts) {
            await prisma.account.create({ data: account });
        }

        // Tills
        for (const till of backup.tills) {
            await prisma.till.create({ data: till });
        }

        // Inventory Balances
        for (const balance of backup.inventoryBalances) {
            await prisma.inventoryBalance.create({ data: balance });
        }

        // Shifts
        for (const shift of backup.shifts) {
            await prisma.shift.create({ data: shift });
        }

        // Sales Invoices
        for (const invoice of backup.salesInvoices) {
            await prisma.salesInvoice.create({ data: invoice });
        }

        // Sales Invoice Lines
        for (const line of backup.salesInvoiceLines) {
            await prisma.salesInvoiceLine.create({ data: line });
        }

        // Sales Payments
        for (const payment of backup.salesPayments) {
            await prisma.salesPayment.create({ data: payment });
        }

        // Sales Returns
        for (const ret of backup.salesReturns) {
            await prisma.salesReturn.create({ data: ret });
        }

        // Purchase Invoices
        for (const invoice of backup.purchaseInvoices) {
            await prisma.purchaseInvoice.create({ data: invoice });
        }

        // Purchase Invoice Lines
        for (const line of backup.purchaseInvoiceLines) {
            await prisma.purchaseInvoiceLine.create({ data: line });
        }

        // Purchase Payments
        for (const payment of backup.purchasePayments) {
            await prisma.purchasePayment.create({ data: payment });
        }

        // Purchase Returns
        for (const ret of backup.purchaseReturns) {
            await prisma.purchaseReturn.create({ data: ret });
        }

        // Expenses
        for (const expense of backup.expenses) {
            await prisma.expense.create({ data: expense });
        }

        // Expense Payments
        for (const payment of backup.expensePayments) {
            await prisma.expensePayment.create({ data: payment });
        }

        // Stock Movements
        for (const movement of backup.stockMovements) {
            await prisma.stockMovement.create({ data: movement });
        }

        // Stock Adjustments
        for (const adjustment of backup.stockAdjustments) {
            await prisma.stockAdjustment.create({ data: adjustment });
        }

        // Journal Entries
        for (const entry of backup.journalEntries) {
            await prisma.journalEntry.create({ data: entry });
        }

        // Journal Lines
        for (const line of backup.journalLines) {
            await prisma.journalLine.create({ data: line });
        }

        return {
            success: true,
            message: `Restored backup from ${new Date(backup.exportedAt).toLocaleString()}. Users will need to reset their passwords.`
        };
    } catch (error) {
        console.error('Import error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Import failed' };
    }
}
