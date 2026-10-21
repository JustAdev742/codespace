// Gives the end-to-end run a fresh database. The server migrates and seeds it on start.
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const name = new URL(url).pathname.slice(1);
if (!/^[a-z0-9_]+$/.test(name) || !name.includes('e2e')) throw new Error(`Refusing to reset "${name}": the e2e database name must contain "e2e".`);
const admin = new pg.Client({ connectionString: url.replace(/\/[^/]*$/, '/postgres') });
await admin.connect();
await admin.query(`drop database if exists ${name} with (force)`);
await admin.query(`create database ${name}`);
await admin.end();
console.log(`e2e database ${name} is fresh`);
