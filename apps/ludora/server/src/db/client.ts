import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.ts';

export type Db = NodePgDatabase<typeof schema>;
/** A transaction handle. Services accept Db | Tx so callers can compose them inside one transaction. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

export function createDb(url: string, max = 10) {
  const pool = new pg.Pool({ connectionString: url, max, idleTimeoutMillis: 30_000 });
  // An idle client erroring (e.g. the database restarted) must not crash the process.
  pool.on('error', () => {});
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export { schema };
