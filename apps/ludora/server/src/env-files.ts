import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

/*
 * Settings from files, for running the server straight from a checkout (`npm run dev`, `npm start`,
 * the operator CLI): `.env.local`, then `.env`, in apps/ludora. `neon env pull` and `neon deploy`
 * write the database's addresses into one of them.
 *
 * - The real environment always wins: a file never changes a variable that is already set, so a host
 *   or a compose file that passes settings is not affected by a file lying about.
 * - `.env.local` wins over `.env`.
 * - The database addresses are taken together, from one place. If the environment already names a
 *   database, none of a file's DATABASE_URL* lines are used; if `.env.local` names one, none of
 *   `.env`'s are. Mixing them could run migrations on one database and the server on another.
 *
 * Nothing here is read by the Docker image: `.dockerignore` keeps both files out of it.
 */

const FILES = ['.env.local', '.env'];
const isDatabase = (key: string) => key.startsWith('DATABASE_URL');

/** apps/ludora: two folders up from this file, from `server/src` and from the built `server/dist` alike. */
function projectRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

/** Reads the files into `env`. Returns the names of the files it took something from, for the log; never a value. */
export function loadEnvFiles(env: Record<string, string | undefined> = process.env, root: string = projectRoot()): string[] {
  const used: string[] = [];
  let databaseNamed = Object.keys(env).some((k) => isDatabase(k) && env[k]);
  for (const name of FILES) {
    const path = resolve(root, name);
    if (!existsSync(path)) continue;
    const values = parseEnv(readFileSync(path, 'utf8')) as Record<string, string | undefined>;
    const skipDatabase = databaseNamed;
    let took = false;
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined || value === '') continue;
      if (env[key] !== undefined && env[key] !== '') continue;
      if (isDatabase(key) && skipDatabase) continue;
      env[key] = value;
      took = true;
      if (isDatabase(key)) databaseNamed = true;
    }
    if (took) used.push(name);
  }
  return used;
}
