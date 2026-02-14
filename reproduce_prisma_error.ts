import { prisma } from './lib/prisma';

async function main() {
    console.log('Testing Prisma Connection...');
    try {
        const count = await prisma.business.count();
        console.log('Business count:', count);

        const sales = await prisma.salesInvoice.findMany({
            take: 1
        });
        console.log('Sales found:', sales.length);
    } catch (e) {
        console.error('Error during query:', e);
    }
}

main().catch(console.error);
