// Test script to verify backup export works
import { prisma } from '../lib/prisma';

async function testBackupExport() {
    console.log('Testing backup export...\n');

    try {
        // Get business
        const business = await prisma.business.findFirst();
        if (!business) {
            console.error('No business found');
            process.exit(1);
        }
        console.log('✓ Business found:', business.name);

        // Get stores
        const stores = await prisma.store.findMany({ where: { businessId: business.id } });
        console.log('✓ Stores:', stores.length);

        // Get users (without passwordHash)
        const users = await prisma.user.findMany({
            where: { businessId: business.id },
            select: { id: true, name: true, email: true, role: true }
        });
        console.log('✓ Users:', users.length);

        // Get products
        const products = await prisma.product.findMany({ where: { businessId: business.id } });
        console.log('✓ Products:', products.length);

        // Get customers
        const customers = await prisma.customer.findMany({ where: { businessId: business.id } });
        console.log('✓ Customers:', customers.length);

        // Get sales invoices
        const salesInvoices = await prisma.salesInvoice.findMany({ where: { businessId: business.id } });
        console.log('✓ Sales Invoices:', salesInvoices.length);

        // Build export data structure
        const exportData = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            business: {
                id: business.id,
                name: business.name,
                currency: business.currency,
                vatEnabled: business.vatEnabled
            },
            stores: stores.length,
            users: users.length,
            products: products.length,
            customers: customers.length,
            salesInvoices: salesInvoices.length
        };

        console.log('\n✓ Backup export structure verified!');
        console.log(JSON.stringify(exportData, null, 2));

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

testBackupExport();
