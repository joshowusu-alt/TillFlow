import Database from 'better-sqlite3';

const db = new Database('dev.db');
db.pragma('journal_mode = WAL');
console.log('WAL mode enabled for dev.db');
db.close();
