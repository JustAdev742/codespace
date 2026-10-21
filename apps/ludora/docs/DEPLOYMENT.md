# Deploying Ludora

Ludora ships as one Node.js process (API, realtime game server and the built web
app) plus PostgreSQL 16. The Docker image and `compose.yaml` in `apps/ludora`
are the supported way to run it.

## Environments

| `APP_ENV` | For | Differences |
|---|---|---|
| `production` | Real players | Secure cookies by default, one allowed origin, QA scenarios off, unlimited test currency only by super administrators, `IP_HASH_KEY` must be set. |
| `sandbox` | A staging copy for staff and testers | Like production, but testers can use QA scenarios and grant unlimited currency to test accounts. Use a separate database. |
| `development` | Your machine | Extra origins for the Vite dev server, verbose defaults. |
| `test` | Automated tests | Used by the test suite. |

Keep production and sandbox on separate databases and separate hostnames. Test
accounts and entitlements live in the database, so a sandbox database must
never be pointed at by production.

## Configuration

All configuration comes from environment variables (see `server/src/config.ts`).
Nothing secret is committed; copy `.env.example` to `.env` for compose.

| Variable | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. |
| `PUBLIC_ORIGIN` | yes | The address people open, e.g. `https://play.example.org`. Used for CSRF and WebSocket origin checks; requests from other origins are refused. |
| `IP_HASH_KEY` | yes in production | At least 16 random characters. IP addresses are only stored as keyed hashes. |
| `APP_ENV` | no (production in the image) | See above. |
| `TRUST_PROXY` | behind a proxy | `true` when a reverse proxy sets `X-Forwarded-For`; needed for per-IP rate limits. |
| `COOKIE_SECURE` | no | Defaults to `true` in production. Only set `false` to try the image over plain http on your own machine. |
| `PORT`, `HOST` | no | Default `8787`, `0.0.0.0`. |
| `LOG_LEVEL` | no | `info` by default. Cookies and authorisation headers are redacted from logs. |
| `UPLOAD_DIR` | no | Reserved for image uploads (not built yet). |
| `ANTHROPIC_API_KEY`, `SMTP_URL` | no | Reserved for features that are not built yet (AI drafts, email). |

## Running with compose

```bash
cd apps/ludora
cp .env.example .env      # then edit: a strong POSTGRES_PASSWORD, your PUBLIC_ORIGIN, a random IP_HASH_KEY
docker compose up -d --build
docker compose exec app node dist/admin.js grant <username> superadmin --reason "first admin"
```

On start the app applies database migrations and adds any shipped content that is
missing (Glims, cosmetics, Lanterns, shop listings, quests, achievements, the
built-in question sets). Shipped items also pick up new art, names and
descriptions from an update, until staff edit them: an edited item is marked as
customised and left alone from then on. Rarity, collection and release state
are never changed on start, because they move odds and the shop. To reset the
catalogue to the shipped content on purpose:

```bash
docker compose exec app node dist/seed.js --force
```

### The first administrator

Register a normal account in the web app, then grant it the super administrator
role with the operator CLI shown above. The CLI needs shell access to the
container, which already has the database credentials; there is no URL, flag or
environment variable that grants staff rights. From then on, roles are managed
in the staff area, and every change is in the audit log.

## Behind a reverse proxy

Terminate TLS at the proxy and forward to port 8787. The proxy must pass
WebSocket upgrades for `/socket.io/` (long polling is used as a fallback when
WebSockets are blocked). Set `TRUST_PROXY=true`.

Example for nginx:

```nginx
location / {
  proxy_pass http://127.0.0.1:8787;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Scaling

Live game rooms are held in the memory of the process that created them, and
game results are written to Postgres when each game ends. One process handles a
large number of classrooms; to run more than one, put them behind a load
balancer with sticky sessions keyed on the room, and route each room code to the
process that owns it. That routing is not built in yet.

A restart (`SIGTERM`) ends every running game, saves the results and pays the
rewards before the process exits. Schedule deployments outside lesson time where
you can.

## Backups and data

- Back up the Postgres database (for example `pg_dump` nightly, with point-in-time
  recovery if your host offers it). Everything that matters is in it: accounts,
  wallets and the ledger, collections, sets, classes, reports and the audit log.
- Passwords and recovery codes are stored as Argon2id hashes; session cookies are
  stored as SHA-256 hashes; IP addresses only as keyed hashes.
- If an account row is deleted, its wallet, ledger entries, inventory, sessions
  and memberships go with it; audit rows and other people's ledger entries keep
  their history with the staff actor set to null. There is no self-service
  account deletion in the app yet.

## Health and monitoring

- `GET /api/health` returns `{ ok: true, environment }` once the database answers.
  The image uses it as its Docker health check.
- Staff with the `system.view` permission see uptime, memory, database latency and
  size, live rooms and sockets, recent errors from the server, browsers and game
  rooms, and which optional features are configured, in the staff area.

## Building without Docker

```bash
cd apps/ludora
npm ci
npm run build                     # web/dist and server/dist
cd server
node dist/migrate.js              # optional: index.js also migrates on start
node --enable-source-maps dist/index.js
```

`server/dist` holds bundles for the server (`index.js`), the operator CLI
(`admin.js`), migrations (`migrate.js`) and the content seed (`seed.js`).
Workspace packages are bundled in; npm dependencies are loaded from
`node_modules`, so install the server's production dependencies next to it.
