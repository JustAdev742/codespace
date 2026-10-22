import pg from 'pg';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { randomBytes } from 'node:crypto';
import { containsBlockedLanguage } from '@ludora/shared';
import { loadConfig, type Config } from '../src/config.ts';
import { createDb, type Db } from '../src/db/client.ts';
import { runMigrations } from '../src/db/migrate.ts';
import { seedContent } from '../src/db/seed.ts';
import { buildApp, type AppDeps } from '../src/app.ts';
import { allRoutes } from '../src/routes.ts';
import { clearRulesCache } from '../src/modules/economy/config.ts';

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';

/** A brand-new database for one test file, dropped afterwards. */
export async function createTestDatabase(): Promise<{ url: string; drop: () => Promise<void> }> {
  const name = `ludora_test_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();
  const url = ADMIN_URL.replace(/\/[^/]*$/, `/${name}`);
  return {
    url,
    drop: async () => {
      const c = new pg.Client({ connectionString: ADMIN_URL });
      await c.connect();
      await c.query(`drop database if exists ${name} with (force)`);
      await c.end();
    },
  };
}

export interface TestContext {
  app: FastifyInstance;
  deps: AppDeps;
  db: Db;
  config: Config;
  close: () => Promise<void>;
}

export async function createTestApp(env: Record<string, string> = {}): Promise<TestContext> {
  const database = await createTestDatabase();
  const config = loadConfig({ APP_ENV: 'test', DATABASE_URL: database.url, LOG_LEVEL: 'silent', PUBLIC_ORIGIN: 'http://localhost:5173', ...env });
  const { db, pool } = createDb(config.DATABASE_URL, 10);
  await runMigrations(db);
  await seedContent(db);
  clearRulesCache();
  const { app, deps } = await buildApp({ config, db, pool }, allRoutes);
  await app.ready();
  return {
    app,
    deps,
    db,
    config,
    close: async () => {
      await app.close();
      await pool.end();
      await database.drop();
    },
  };
}

/** A browser-like client: keeps cookies and sends the CSRF header. */
export class Client {
  cookies = new Map<string, string>();
  constructor(private app: FastifyInstance) {}

  private cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  private remember(res: LightMyRequestResponse) {
    for (const c of res.cookies as { name: string; value: string; maxAge?: number }[]) {
      if (c.value === '' || c.maxAge === 0) this.cookies.delete(c.name);
      else this.cookies.set(c.name, c.value);
    }
  }

  async request(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await this.app.inject({
      method,
      url,
      payload: body === undefined ? undefined : (body as object),
      headers: { 'x-ludora-csrf': '1', cookie: this.cookieHeader(), ...headers },
    });
    this.remember(res);
    let json: any = null;
    try {
      json = res.json();
    } catch {
      json = null;
    }
    return { status: res.statusCode, body: json, res };
  }

  get(url: string) {
    return this.request('GET', url);
  }
  post(url: string, body: unknown = {}, headers?: Record<string, string>) {
    return this.request('POST', url, body, headers);
  }
  put(url: string, body: unknown = {}) {
    return this.request('PUT', url, body);
  }
  patch(url: string, body: unknown = {}) {
    return this.request('PATCH', url, body);
  }
  delete(url: string) {
    return this.request('DELETE', url);
  }
}

let n = 0;
export function uniqueName(prefix = 'user') {
  // The name filter reads digits as letters (7175 is "tits"), so a random name now and then is
  // refused at sign-up; skip those rather than fail a test at random.
  for (;;) {
    const name = `${prefix}${Date.now().toString(36).slice(-5)}${++n}`;
    if (!containsBlockedLanguage(name)) return name;
  }
}

export async function registered(app: FastifyInstance, opts: { username?: string; password?: string; accountType?: string } = {}) {
  const c = new Client(app);
  const username = opts.username ?? uniqueName('p');
  const password = opts.password ?? 'correct horse battery';
  const r = await c.post('/api/auth/register', { username, password, accountType: opts.accountType ?? 'player' });
  if (r.status !== 200) throw new Error(`register failed: ${r.status} ${JSON.stringify(r.body)}`);
  const me = await c.get('/api/auth/me');
  return { client: c, username, password, userId: me.body.user.id as string, recoveryCode: r.body.recoveryCode as string };
}
