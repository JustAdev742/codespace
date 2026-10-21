import { loadConfig } from './config.ts';
import { createDb } from './db/client.ts';
import { runMigrations } from './db/migrate.ts';
import { seedContent } from './db/seed.ts';
import { buildApp } from './app.ts';
import { allRoutes } from './routes.ts';
import { attachRealtime } from './realtime/attach.ts';

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL, 20);
await runMigrations(db);
await seedContent(db);
const { app, deps } = await buildApp({ config, db, pool }, allRoutes);
const realtime = attachRealtime(app, deps);
await app.listen({ port: config.PORT, host: config.HOST });
app.log.info(`Ludora (${config.APP_ENV}) listening on ${config.HOST}:${config.PORT}`);

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  app.log.info(`${signal}: saving active games and shutting down`);
  await realtime.shutdown();
  await app.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
