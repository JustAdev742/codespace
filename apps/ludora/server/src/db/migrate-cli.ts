import { loadConfig } from '../config.ts';
import { createDb } from './client.ts';
import { runMigrations } from './migrate.ts';

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL, 1);
await runMigrations(db);
console.log('Migrations applied.');
await pool.end();
