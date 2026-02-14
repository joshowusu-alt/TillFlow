import { prisma } from './lib/prisma';

async function main() {
    console.log('Testing Prisma connection...');
    try {
        const userCount = await prisma.user.count();
        console.log(`Connection successful! User count: ${userCount}`);
    } catch (e) {
        console.error('Prisma connection failed:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
