import { loadConfig } from '../config.ts';
import { createDb } from './client.ts';
import { runMigrations } from './migrate.ts';
import { seedContent } from './seed.ts';

const force = process.argv.includes('--force');
const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL, 1);
await runMigrations(db);
const { inserted } = await seedContent(db, { force });
console.log(force ? 'Seed content written (existing rows overwritten).' : 'Seed content written (existing rows kept).', inserted);
await pool.end();
