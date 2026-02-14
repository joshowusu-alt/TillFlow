import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import Database from 'better-sqlite3';

console.log('Testing PrismaBetterSqlite3...');

try {
    const db = new Database('dev.db');
    console.log('Database opened');

    try {
        const adapter = new PrismaBetterSqlite3(db);
        console.log('Adapter created successfully:', adapter);
    } catch (e) {
        console.error('Failed to create adapter:', e);
    }
} catch (e) {
    console.error('Failed to open database:', e);
}
