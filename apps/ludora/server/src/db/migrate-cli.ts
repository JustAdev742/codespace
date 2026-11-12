import { loadConfig } from '../config.ts';
import { loadEnvFiles } from '../env-files.ts';
import { createDb } from './client.ts';
import { runMigrations } from './migrate.ts';

loadEnvFiles();
const config = loadConfig();
const { db, pool } = createDb(config.directDatabaseUrl, 1);
await runMigrations(db);
console.log('Migrations applied.');
await pool.end();
