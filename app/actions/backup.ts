'use server';

import { validateRecoverySnapshot } from '@/lib/backup-restore-contract';
import {serializePurchaseDocument,restorePurchaseDocument} from '@/lib/purchases/document-backup';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { isPostgresRuntimeEnv } from '@/lib/database-runtime';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { withBusinessContext, safeAction, ok, err, type ActionResult } from '@/lib/action-utils';
import { audit } from '@/lib/audit';
import { ACTIVE_BUSINESS_COOKIE, SESSION_COOKIE_PREFIX } from '@/lib/business-scope';
import { parseOptionalReceiptOrigin } from '@/lib/payments/receipt-origin';

export interface BackupData {
    version: string;
    exportedAt: string;
    business: any;
    stores: any[];
    users: any[];
    customers: any[];
    suppliers: any[];
    categories: any[];
    productDivisions?: any[];
    productGroups?: any[];
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
    purchaseDocuments?: any[];
    purchaseInvoiceLines: any[];
    purchasePayments: any[];
    purchaseReturns: any[];
    expenses: any[];
    expensePayments: any[];
    stockMovements: any[];
    stockAdjustments: any[];
    tills: any[];
    shifts: any[];
    cashDrawerEntries?: any[];
    moneyIdempotencies?: any[];
    businessSequences?: any[];
    syncEvents?: any[];
    mobileMoneyCollections?: any[];
    mobileMoneyStatusLogs?: any[];
    cashVarianceInvestigations?: any[];
    stockTransfers?: any[];
    stockTransferLines?: any[];
    productBarcodes?: any[];
    paymentReconciliations?: any[];
    dayClosures?: any[];
    openingBalances?: any[];

}

export async function exportDatabaseAction(): Promise<ActionResult<BackupData>> {
  return safeAction(async () => {
    const { businessId, user } = await withBusinessContext(['OWNER'], { requireWrite: false });

    // A backup must represent one committed moment, even while tills are trading.
    const backupData = await prisma.$transaction(async tx => {
    const business = await tx.business.findUnique({ where: { id: businessId } });
    if (!business) return null;

        // Export all tables
        const [
            stores,
            users,
            customers,
            suppliers,
            categories,
            productDivisions,
            productGroups,
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
            purchaseDocuments,
            purchaseInvoiceLines,
            purchasePayments,
            purchaseReturns,
            expenses,
            expensePayments,
            stockMovements,
            stockAdjustments,
            tills,
            shifts,
            cashDrawerEntries,
            moneyIdempotencies,
            businessSequences,
            syncEvents,
            mobileMoneyCollections,
            mobileMoneyStatusLogs,
            cashVarianceInvestigations,
            stockTransfers,
            stockTransferLines,
            productBarcodes,
            paymentReconciliations,
            dayClosures,
            openingBalances
        ] = await Promise.all([
            tx.store.findMany({ where: { businessId } }),
            tx.user.findMany({ where: { businessId }, select: { id: true, businessId: true, name: true, email: true, role: true, active: true, createdAt: true } }),
            tx.customer.findMany({ where: { businessId } }),
            tx.supplier.findMany({ where: { businessId } }),
            tx.category.findMany({ where: { businessId } }),
            tx.productDivision.findMany({ where: { businessId, category: { businessId } } }),
            tx.productGroup.findMany({ where: { businessId, division: { businessId, category: { businessId } } } }),
            tx.product.findMany({ where: { businessId } }),
            tx.unit.findMany({ where: { productUnits: { some: { product: { businessId } } } } }),
            tx.productUnit.findMany({ where: { product: { businessId } } }),
            tx.inventoryBalance.findMany({ where: { store: { businessId } } }),
            tx.account.findMany({ where: { businessId } }),
            tx.journalEntry.findMany({ where: { businessId } }),
            tx.journalLine.findMany({ where: { journalEntry: { businessId } } }),
            tx.salesInvoice.findMany({ where: { businessId } }),
            tx.salesInvoiceLine.findMany({ where: { salesInvoice: { businessId } } }),
            tx.salesPayment.findMany({ where: { salesInvoice: { businessId } } }),
            tx.salesReturn.findMany({ where: { salesInvoice: { businessId } } }),
            tx.purchaseInvoice.findMany({ where: { businessId } }),
            tx.purchaseDocument.findMany({where:{businessId,purchaseInvoice:{businessId}}}),
            tx.purchaseInvoiceLine.findMany({ where: { purchaseInvoice: { businessId } } }),
            tx.purchasePayment.findMany({ where: { purchaseInvoice: { businessId } } }),
            tx.purchaseReturn.findMany({ where: { purchaseInvoice: { businessId } } }),
            tx.expense.findMany({ where: { businessId } }),
            tx.expensePayment.findMany({ where: { businessId } }),
            tx.stockMovement.findMany({ where: { store: { businessId } } }),
            tx.stockAdjustment.findMany({ where: { store: { businessId } } }),
            tx.till.findMany({ where: { store: { businessId } } }),
            tx.shift.findMany({ where: { till: { store: { businessId } } } }),
            tx.cashDrawerEntry.findMany({ where: { businessId } }),
            tx.moneyIdempotency.findMany({ where: { businessId } }),
            tx.businessSequence.findMany({ where: { businessId } }),
            tx.syncEvent.findMany({ where: { businessId } }),
            tx.mobileMoneyCollection.findMany({ where: { businessId } }),
            tx.mobileMoneyStatusLog.findMany({ where: { collection: { businessId } } }),
            tx.cashVarianceInvestigation.findMany({ where: { businessId } }),
            tx.stockTransfer.findMany({ where: { businessId } }),
            tx.stockTransferLine.findMany({ where: { stockTransfer: { businessId } } }),
            tx.productBarcode.findMany({ where: { businessId } }),
            tx.paymentReconciliation.findMany({ where: { businessId } }),
            tx.dayClosure.findMany({ where: { businessId } }),
            tx.openingBalance.findMany({ where: { businessId } })
        ]);

        return {
            version: '1.4',
            exportedAt: new Date().toISOString(),
            business,
            stores,
            users,
            customers,
            suppliers,
            categories,
            productDivisions,
            productGroups,
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
            purchaseDocuments:purchaseDocuments.map(serializePurchaseDocument),
            purchaseInvoiceLines,
            purchasePayments,
            purchaseReturns,
            expenses,
            expensePayments,
            stockMovements,
            stockAdjustments,
            tills,
            shifts,
            cashDrawerEntries,
            moneyIdempotencies,
            businessSequences,
            syncEvents,
            mobileMoneyCollections,
            mobileMoneyStatusLogs,
            cashVarianceInvestigations,
            stockTransfers,
            stockTransferLines,
            productBarcodes,
            paymentReconciliations,
            dayClosures,
            openingBalances
        } satisfies BackupData;
    }, { isolationLevel: (isPostgresRuntimeEnv() ? 'RepeatableRead' : 'Serializable') as Prisma.TransactionIsolationLevel, maxWait: 10000, timeout: 120000 });
    if (!backupData) return err('No business set up yet. Please complete onboarding first.');

    await audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'BACKUP_EXPORT',
      details: {
        exportedAt: backupData.exportedAt,
        productCount: backupData.products.length,
        salesCount: backupData.salesInvoices.length,
        purchaseCount: backupData.purchaseInvoices.length,
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

    try { validateRecoverySnapshot(backup, businessId, user.id); }
    catch (error) { return err(error instanceof Error ? error.message : 'Invalid recovery snapshot.'); }
    const currentOwner = await prisma.user.findFirst({ where: { id: user.id, businessId, role: 'OWNER', active: true }, select: { passwordHash: true, twoFactorEnabled: true, twoFactorSecret: true, twoFactorTempSecret: true, approvalPinHash: true } });
    if (!backup.users.some(restored => restored.id === user.id && restored.email === user.email && restored.active !== false)) return err('The backup must retain the restoring owner email and active status.');
    if (!currentOwner) return err('An active owner account is required for recovery.');
    // Do not destroy unsupported workflows that this core-trading snapshot cannot restore.
    const unsupported = await Promise.all([prisma.onlineOrder.count({ where: { businessId } }), prisma.migrationPackage.count({ where: { businessId } }), prisma.productImport.count({ where: { businessId } })]);
    if (unsupported.some(Boolean)) return err('This business has storefront, migration or import-history records requiring an operator-assisted full recovery. No records were changed.');
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

    const invoiceIds=new Set(list(backup.purchaseInvoices).map(invoice=>invoice.id));
    const restoredDocuments=list(backup.purchaseDocuments).map(document=>restorePurchaseDocument(document,businessId,invoiceIds));

    // Pre-compute bcrypt hashes for users before opening the transaction (CPU-only, no DB).
    const userHashes = new Map<string, string>();
    for (const restoredUser of users) {
      userHashes.set(restoredUser.id, restoredUser.id === user.id ? currentOwner.passwordHash : await bcrypt.hash(randomBytes(32).toString('hex'), 10));
    }

    // Atomic restore: wipe + re-insert in one transaction so a partial failure rolls back fully.
    await prisma.$transaction(async (tx) => {
      // Clear only this business data (multi-tenant safe) in FK-safe order.
      await tx.moneyIdempotency.deleteMany({ where: { businessId } });
      await tx.businessSequence.deleteMany({ where: { businessId } });
      await tx.cashVarianceInvestigation.deleteMany({ where: { businessId } });
      await tx.paymentReconciliation.deleteMany({ where: { businessId } });
      await tx.openingBalance.deleteMany({ where: { businessId } });
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
      await tx.purchaseInvoice.updateMany({where:{businessId},data:{linkedCostExpenseId:null}});
      await tx.expense.deleteMany({ where: { businessId } });
      await tx.stockAdjustment.deleteMany({ where: { store: { businessId } } });
      await tx.stockMovement.deleteMany({ where: { store: { businessId } } });
      await tx.salesReturn.deleteMany({ where: { salesInvoice: { businessId } } });
      await tx.salesInvoiceLine.deleteMany({ where: { salesInvoice: { businessId } } });
      await tx.salesInvoice.deleteMany({ where: { businessId } });
      await tx.purchasePayment.deleteMany({ where: { purchaseInvoice: { businessId } } });
      await tx.purchaseReturn.deleteMany({ where: { purchaseInvoice: { businessId } } });
      await tx.purchaseInvoiceLine.deleteMany({ where: { purchaseInvoice: { businessId } } });
      await tx.purchaseDocument.deleteMany({where:{businessId}});
      await tx.purchaseInvoice.deleteMany({ where: { businessId } });
      await tx.inventoryBalance.deleteMany({ where: { store: { businessId } } });
      await tx.stocktakeLine.deleteMany({ where: { stocktake: { store: { businessId } } } });
      await tx.stocktake.deleteMany({ where: { store: { businessId } } });
      await tx.productUnit.deleteMany({ where: { product: { businessId } } });
      await tx.product.deleteMany({ where: { businessId } });
      await tx.productGroup.deleteMany({ where: { businessId } });
      await tx.productDivision.deleteMany({ where: { businessId } });
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
        update: {},
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

      for (const restoredUser of users) {
        const safeHash = userHashes.get(restoredUser.id)!;
        await tx.user.create({
          data: {
            ...restoredUser,
            businessId,
            passwordHash: safeHash,
            // Never export MFA/PIN secrets; retain restoring owner's server-side factors.
            ...(restoredUser.id === user.id ? currentOwner : {}),
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

      const categoryIds = new Set(list(backup.categories).map(category => category.id));
      const divisionIds = new Set(list(backup.productDivisions).map(division => division.id));
      const groupIds = new Set(list(backup.productGroups).map(group => group.id));
      for (const division of list(backup.productDivisions)) {
        if (!categoryIds.has(division.categoryId)) throw new Error('A division references a category missing from this backup.');
        await tx.productDivision.create({ data: { ...division, businessId } });
      }
      for (const group of list(backup.productGroups)) {
        if (!divisionIds.has(group.divisionId)) throw new Error('A group references a division missing from this backup.');
        await tx.productGroup.create({ data: { ...group, businessId } });
      }

      for (const product of list(backup.products)) {
        if (product.groupId && !groupIds.has(product.groupId)) throw new Error('A product group is missing from this backup.');
        // Classification parents are restored before their product links.
        // PostgreSQL registers a primary barcode via an INSERT trigger. Restore
        // the registry explicitly first, then set primaries, so it is inserted
        // exactly once on both PostgreSQL and SQLite.
        await tx.product.create({ data: { ...product, businessId, barcode: null } });
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

      for (const collection of list(backup.mobileMoneyCollections)) await tx.mobileMoneyCollection.create({ data: { ...collection, businessId } });
      for (const log of list(backup.mobileMoneyStatusLogs)) await tx.mobileMoneyStatusLog.create({ data: log });

      for (const payment of list(backup.salesPayments)) {
        // Version 1.4 restores collection evidence before linking payment rows.
        // receiptOrigin: preserve valid new-format values; missing/empty → NULL (legacy unclassified).
        // Invalid values fail the restore rather than fabricating origin.
        const { collectionId: _ignoredCollectionId, receiptOrigin: rawOrigin, ...rest } = payment as Record<
          string,
          unknown
        >;
        const receiptOrigin = parseOptionalReceiptOrigin(rawOrigin);
        await tx.salesPayment.create({
          data: {
            ...rest,
            collectionId: payment.collectionId ?? null,
            ...(receiptOrigin != null ? { receiptOrigin } : { receiptOrigin: null }),
          } as any,
        });
      }

      for (const ret of list(backup.salesReturns)) {
        await tx.salesReturn.create({ data: ret });
      }

      for (const invoice of list(backup.purchaseInvoices)) {
        await tx.purchaseInvoice.create({ data: { ...invoice, businessId,linkedCostExpenseId:null } });
      }

      for(const document of restoredDocuments)await tx.purchaseDocument.create({data:document});

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

      const expenseIds=new Set(list(backup.expenses).map(expense=>expense.id));
      for(const invoice of list(backup.purchaseInvoices)){
        if(!invoice.linkedCostExpenseId)continue;
        if(!expenseIds.has(invoice.linkedCostExpenseId))throw new Error('A linked purchase expense is missing from this backup.');
        await tx.purchaseInvoice.update({where:{id:invoice.id},data:{linkedCostExpenseId:invoice.linkedCostExpenseId}});
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
      for (const row of list(backup.cashDrawerEntries)) await tx.cashDrawerEntry.create({ data: row });
      for (const row of list(backup.moneyIdempotencies)) await tx.moneyIdempotency.create({ data: row });
      for (const row of list(backup.businessSequences)) await tx.businessSequence.create({ data: row });
      for (const row of list(backup.syncEvents)) await tx.syncEvent.create({ data: row });
      for (const row of list(backup.cashVarianceInvestigations)) await tx.cashVarianceInvestigation.create({ data: row });
      for (const row of list(backup.stockTransfers)) await tx.stockTransfer.create({ data: row });
      for (const row of list(backup.stockTransferLines)) await tx.stockTransferLine.create({ data: row });
      for (const row of list(backup.productBarcodes)) await tx.productBarcode.create({ data: row });
      for (const product of list(backup.products)) {
        if (product.barcode != null) await tx.product.update({ where: { id: product.id }, data: { barcode: product.barcode, updatedAt: product.updatedAt } });
      }
      for (const row of list(backup.paymentReconciliations)) await tx.paymentReconciliation.create({ data: row });
      for (const row of list(backup.dayClosures)) await tx.dayClosure.create({ data: row });
      for (const row of list(backup.openingBalances)) await tx.openingBalance.create({ data: row });

    }, { timeout: 60000, maxWait: 10000 });

    // Imported users have random temporary passwords and sessions were cleared.
    const cookieStore = await cookies();
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
      message: `Restored backup from ${exportDate.toLocaleString()}. The restoring owner can sign in with the existing password; other users need password resets.`
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
      prisma.purchaseInvoice.updateMany({where:{businessId},data:{linkedCostExpenseId:null}}),
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
      prisma.purchaseDocument.deleteMany({where:{businessId}}),
      prisma.purchaseInvoice.deleteMany({ where: { businessId } }),
      // Inventory & products
      prisma.inventoryBalance.deleteMany({ where: { store: { businessId } } }),
      prisma.productUnit.deleteMany({ where: { product: { businessId } } }),
      prisma.product.deleteMany({ where: { businessId } }),
      // Categories
      prisma.productGroup.deleteMany({ where: { businessId } }),
      prisma.productDivision.deleteMany({ where: { businessId } }),
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
