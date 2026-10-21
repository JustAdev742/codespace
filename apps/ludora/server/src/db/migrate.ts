import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Db } from './client.ts';

/** The migrations folder, whether running from source (src/db) or from the bundle (dist). */
export function migrationsFolder(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [resolve(here, '../../drizzle'), resolve(here, '../drizzle'), resolve(process.cwd(), 'drizzle')];
  const found = candidates.find((c) => existsSync(resolve(c, 'meta/_journal.json')));
  if (!found) throw new Error(`Could not find the migrations folder (looked in ${candidates.join(', ')})`);
  return found;
}

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: migrationsFolder() });
}
