import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';
import { loadEnvFiles } from '../src/env-files.ts';

/*
 * Settings files for running from a checkout (.env.local, then .env): the environment always wins,
 * and the database addresses are only ever taken together from one place.
 */

const dirs: string[] = [];
function root(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'ludora-env-'));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const NEON = 'DATABASE_URL="postgresql://app:secret@ep-example.ap-southeast-2.aws.neon.tech/neondb?sslmode=require"\nDATABASE_URL_POOLED="postgresql://app:secret@ep-example-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require"\n';

describe('settings files', () => {
  it('fills in what the environment does not set, and never changes what it does', () => {
    const env: Record<string, string | undefined> = { LOG_LEVEL: 'warn' };
    const used = loadEnvFiles(env, root({ '.env.local': `# a comment\nLOG_LEVEL=debug\nOPERATOR_NAME="A School"\n${NEON}` }));
    expect(used).toEqual(['.env.local']);
    expect(env.LOG_LEVEL).toBe('warn');
    expect(env.OPERATOR_NAME).toBe('A School');
    expect(env.DATABASE_URL).toContain('ep-example.ap-southeast-2');
    expect(env.DATABASE_URL_POOLED).toContain('ep-example-pooler');
  });

  it('takes no database address from a file when the environment already names a database', () => {
    // The browser tests start the server with their own DATABASE_URL: a pooled address in a file left
    // on the machine must not send that server's queries to another database.
    const env: Record<string, string | undefined> = { DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/ludora_e2e' };
    const used = loadEnvFiles(env, root({ '.env.local': `${NEON}OPERATOR_NAME=Kept\n` }));
    expect(env.DATABASE_URL).toBe('postgres://postgres:postgres@localhost:5432/ludora_e2e');
    expect(env.DATABASE_URL_POOLED).toBeUndefined();
    expect(env.OPERATOR_NAME).toBe('Kept');
    expect(used).toEqual(['.env.local']);
    const c = loadConfig(env);
    expect(c.databaseUrl).toBe(c.directDatabaseUrl);
  });

  it('lets .env.local win over .env, database addresses included as a group', () => {
    const env: Record<string, string | undefined> = {};
    const used = loadEnvFiles(env, root({ '.env.local': NEON, '.env': 'DATABASE_URL_UNPOOLED=postgres://other@elsewhere/other\nDATABASE_URL=postgres://other@elsewhere/other\nPORT=9000\n' }));
    expect(used).toEqual(['.env.local', '.env']);
    expect(env.DATABASE_URL).toContain('neon.tech');
    expect(env.DATABASE_URL_UNPOOLED).toBeUndefined();
    expect(env.PORT).toBe('9000');
  });

  it('does nothing without files, and ignores empty values', () => {
    const env: Record<string, string | undefined> = {};
    expect(loadEnvFiles(env, root({}))).toEqual([]);
    expect(loadEnvFiles(env, root({ '.env': 'DATABASE_URL=\nOPERATOR_NAME=\n' }))).toEqual([]);
    expect(env).toEqual({});
  });
});

describe('two addresses for one database', () => {
  const direct = 'postgresql://app:secret@ep-example.ap-southeast-2.aws.neon.tech/neondb?sslmode=require';
  const pooled = 'postgresql://app:secret@ep-example-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require';

  it("uses the pooled address for queries and the direct one for migrations, by Neon's console names", () => {
    const c = loadConfig({ DATABASE_URL: direct, DATABASE_URL_POOLED: pooled });
    expect(c.databaseUrl).toBe(pooled);
    expect(c.directDatabaseUrl).toBe(direct);
  });

  it("does the same by the names `neon env pull` writes", () => {
    const c = loadConfig({ DATABASE_URL: pooled, DATABASE_URL_UNPOOLED: direct });
    expect(c.databaseUrl).toBe(pooled);
    expect(c.directDatabaseUrl).toBe(direct);
  });

  it('uses one address for both when that is all there is, as before', () => {
    const c = loadConfig({ DATABASE_URL: direct, DATABASE_URL_POOLED: '' });
    expect(c.databaseUrl).toBe(direct);
    expect(c.directDatabaseUrl).toBe(direct);
    const d = loadConfig({});
    expect(d.databaseUrl).toBe('postgres://postgres:postgres@localhost:5432/ludora');
    expect(d.directDatabaseUrl).toBe(d.databaseUrl);
  });

  it('refuses addresses that name different databases, without printing a password', () => {
    let message = '';
    try {
      loadConfig({ DATABASE_URL: 'postgres://postgres:hunter2@localhost:5432/ludora_e2e', DATABASE_URL_POOLED: pooled });
    } catch (e) {
      message = String(e);
    }
    expect(message).toMatch(/different databases \("ludora_e2e" and "neondb"\)/);
    expect(message).not.toContain('hunter2');
    expect(message).not.toContain('secret');
  });
});
