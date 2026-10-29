# Deploying Ludora

Ludora ships as one Node.js process (API, realtime game server and the built web
app) plus PostgreSQL 16. The Docker image and `compose.yaml` in `apps/ludora`
are the supported way to run it.

## From a blank server to a school's own copy

About half an hour, most of it waiting for the first build. You need:

- **A Linux server** with Docker: 1 to 2 vCPUs, 2 GB of memory and 20 GB of disk is plenty
  for several classes at once (see *Measured capacity*). Any provider works. For Australian
  schools, a Sydney region keeps students' data in Australia and the game quick.
- **A domain name** you control, such as `play.your-school.org`.
- **Someone comfortable with a terminal** for the first setup. After that, staff manage
  everything in the web app.

Then:

1. **DNS.** Add an `A` record (and `AAAA` for IPv6) for the domain, pointing at the server.
   Carry on once `dig +short play.your-school.org` prints the server's address.
2. **Firewall.** Allow TCP 22 (SSH), 80 and 443, and UDP 443.
3. **Docker.** Install Docker Engine with the compose plugin, following Docker's guide for
   your distribution (docs.docker.com/engine/install).
4. **The code.** Clone the repository and change into the app:
   ```bash
   sudo git clone --depth 1 --branch <branch or tag> https://github.com/JustAdev742/codespace /srv/codespace
   cd /srv/codespace/apps/ludora
   ```
5. **Settings.** Write `.env` with fresh random secrets:
   ```bash
   sudo bash scripts/new-env.sh play.your-school.org "Your School" privacy@your-school.org
   ```
   It refuses to overwrite an existing `.env`. Keep a copy of the file in your password
   manager: it holds the database password and the keys.
6. **Start it.**
   ```bash
   sudo docker compose up -d --build
   ```
   `.env` names both compose files, so this also starts Caddy, which gets a Let's Encrypt
   certificate for the domain within a minute or two and renews it by itself. Port 8787 is not
   published: only Caddy can reach the app.
7. **The first administrator.** Open `https://play.your-school.org`, sign up, then:
   ```bash
   sudo docker compose exec app node dist/admin.js grant <username> superadmin --reason "first admin"
   ```
8. **Backups.** Add the nightly job from `scripts/backup.sh` to root's crontab, and copy
   `backups/` somewhere off the server (see *Backups and data*).
9. **Check.** `/privacy` names your school, and Staff → System shows the database, live
   rooms and recent errors. `/demo/` plays a practice game on one screen against bots, with no
   account and nothing saved: useful for a class with no devices.

**Updating.** Take a backup, then, outside lesson time (running games end, and their results
are saved):

```bash
sudo bash scripts/backup.sh
sudo git pull && sudo docker compose up -d --build
```

Migrations only move forward. To go back to an older version after an update that changed
the database, check out the old version and restore the backup taken just before the update.

What was tested, on 2026-10-29, with Docker 29 and compose 5.6:

- The stack came up with the HTTPS proxy, using Caddy's local certificate for `localhost`,
  since the test machine has no public domain. HTTP redirected to HTTPS, and the security
  headers and CSP named the domain.
- A game ran over WebSockets through Caddy: `scripts/load-test.mjs --insecure` with 8 players
  and 3 bots.
- A backup and restore brought back an account and an uploaded image, and removed an account
  made after the backup.
- A backup taken while the app was stopped failed cleanly, with nothing half-written left behind.

Getting a real Let's Encrypt certificate needs a public domain, so that step has not been
tested here; it is Caddy's standard behaviour.

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
| `IP_HASH_KEY` | yes in production | At least 16 random characters. IP addresses are only stored as keyed hashes. Production refuses the `change-me` and `dev-only` placeholders. |
| `CHAOS_SECRET` | no | At least 16 random characters (`openssl rand -hex 32`). Seeds the secret lantern's knock rhythm (see CHAOS.md); without it the rhythm is derived from `IP_HASH_KEY`. Keep it in the host's secret store or `.env`, never in the repository. Changing it changes the rhythm. |
| `OPERATOR_NAME`, `OPERATOR_CONTACT` | before real use | Who runs this copy (a school, a trust, a company) and an email or address for privacy questions. The privacy policy and terms at `/privacy` and `/terms` name them; until they are set, those pages say the operator has not added contact details. |
| `SCHOOL_THEME` | no | A school's own look: its colours and typeface on every page and game screen, from the first paint. `hills-grammar` is The Hills Grammar School's green palette and Lato, done at the school's request. Unset keeps Ludora's look. An unknown name stops the server at startup. A new school's look is a block in `web/src/styles/schools.css` plus its name in `SCHOOL_THEMES` (`server/src/config.ts`). |
| `APP_ENV` | no (production in the image) | See above. |
| `TRUST_PROXY` | behind a proxy | `true` when a reverse proxy sets `X-Forwarded-For`; needed for per-IP rate limits. |
| `COOKIE_SECURE` | no | Defaults to `true` in production. Only set `false` to try the image over plain http on your own machine. |
| `PORT`, `HOST` | no | Default `8787`, `0.0.0.0`. |
| `LOG_LEVEL` | no | `info` by default. Cookies and authorisation headers are redacted from logs. |
| `UPLOAD_DIR` | no | Where uploaded question images are kept. The image uses `/data/uploads`, which compose mounts as the `uploads` volume so images survive upgrades. |
| `ANTHROPIC_API_KEY` | no | Turns on AI question drafts in the set editor, once staff also switch on the `ai.question_drafts` flag. It stays on the server and is never sent to browsers. |
| `ANTHROPIC_MODEL` | no | The Claude model that drafts questions. Default `claude-opus-5-5`. |
| `AI_DRAFTS_DAILY_LIMIT` | no | Draft requests allowed across the whole site in any 24 hours, to cap spending. Default 500. Each account also has its own allowance of 30 a day. |
| `SMTP_URL` | no | Unused: Ludora does not send email (D38). |

## Running with compose

The quick start above uses `scripts/new-env.sh`. By hand, or behind a proxy you already run:

```bash
cd apps/ludora
cp .env.example .env      # then edit: a strong POSTGRES_PASSWORD, your PUBLIC_ORIGIN, a random IP_HASH_KEY
docker compose up -d --build                                     # the app on port 8787, no HTTPS
docker compose -f compose.yaml -f compose.https.yaml up -d --build   # with Caddy and HTTPS (needs DOMAIN)
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

### AI question drafts

With `ANTHROPIC_API_KEY` set, switch on the `ai.question_drafts` flag in the
staff area (Feature flags) for everyone, some roles or a rollout percentage.
Teachers, creators and staff then see "Draft with AI" in the set editor. A
request can take up to a minute or two, so if a reverse proxy sits in front of
the app, give `/api/ai/drafts` a read timeout of at least 180 seconds. The
System page in the staff area shows whether drafting is configured.

### The first administrator

Register a normal account in the web app, then grant it the super administrator
role with the operator CLI shown above. The CLI needs shell access to the
container, which already has the database credentials; there is no URL, flag or
environment variable that grants staff rights. From then on, roles are managed
in the staff area, and every change is in the audit log.

## Behind a reverse proxy

`compose.https.yaml` and `deploy/Caddyfile` are the bundled proxy. With a proxy of your own,
terminate TLS there and forward to port 8787. The proxy must pass
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

### Measured capacity

`scripts/load-test.mjs` plays real games over WebSockets against a running server:
players answer every question after 0.8 to 5 seconds, alongside the server's own
practice bots. Measured on 2026-10-29 against the production build on one 2.8 GHz
Xeon core, Postgres on the same machine:

| Load | Server CPU (one core) | Answer round trip, p95 | One update reaching every player, p95 | Memory |
|---|---|---|---|---|
| Classic, 40 players + 20 bots | mean 3%, max 11% | 6 ms | 14 ms | 206 → 209 MB |
| Glow Tag Royale (3D), 40 players + 20 bots | mean 10%, max 18% | 6 ms | 16 ms | 210 → 213 MB |
| Classic, 120 players in one room | mean 12%, max 50% | 41 ms | 64 ms | 221 → 225 MB |
| Four games at once (Classic, Gold Rush, Glow Tag, Big Catch), 30 players + 10 bots each | mean 25%, max 44% | 6 ms | 12 ms | 193 → 235 MB |

So one small server (1 to 2 vCPUs, 1 GB of memory) comfortably runs several classes
at once. The numbers leave out the players' own networks, which add their latency
on top. Run it again before a big rollout:

```bash
node scripts/load-test.mjs --base https://your-test-server --mode glow-tag --players 40 --bots 20 --seconds 90
```

It creates a teacher account and a room, so point it at a test server, not a live one.

## Backups and data

- Back up the Postgres database and the uploaded images. Everything that matters is in
  them: accounts, wallets and the ledger, collections, sets, classes, reports, the audit
  log and question pictures. With compose, `scripts/backup.sh` writes both, keeps the
  newest 14 (`KEEP=30` for more) and is safe to run from cron:
  ```bash
  15 2 * * * cd /srv/codespace/apps/ludora && bash scripts/backup.sh >> backups/backup.log 2>&1
  ```
  The files are readable only by root. Copy them off the server as well (to your school's
  storage, with rclone or your host's snapshot service); a backup on the same disk is lost
  with it.
- To restore, outside lesson time: `bash scripts/restore.sh backups/ludora-<time>.dump
  backups/uploads-<time>.tar.gz`. It asks you to type `yes`, replaces the whole database and
  the images, and restarts the app. If it stops part-way it says how to start the app again.
- Restoring onto a new server works the same way, with the old `.env` copied across first.
  A different `IP_HASH_KEY` or `CHAOS_SECRET` does not break anything: sign-in rate limits
  and the secret lantern's rhythm simply start afresh.
- Passwords and recovery codes are stored as Argon2id hashes; session cookies are
  stored as SHA-256 hashes; IP addresses only as keyed hashes.
- Players download or delete their own account under **Settings → Your data**
  (`GET /api/me/export`, `POST /api/me/delete`; see `server/src/modules/users/account.ts`).
  Deleting needs the username typed out and the password, and is refused for staff
  roles (remove the roles first). It removes the account with its wallet, ledger,
  collection, sessions, friendships, the classes it teaches, its private sets and
  images no remaining set uses. Game results stay with the name replaced by
  "Player"; public sets stay without an owner; audit entries stay with the name
  replaced by "Deleted account".
- Deleted rows remain in database backups until those backups expire. Say how
  long you keep backups in your privacy policy.

## Privacy policy and terms

`/privacy` and `/terms` (linked from sign-up, Settings and every page's footer) describe
what this software actually stores and does: checked against the code on 2026-10-29, in
plain words for students. They are a starting point, not legal advice. Before real
students use your copy:

- set `OPERATOR_NAME` and `OPERATOR_CONTACT`, so both pages say who runs it and how to
  reach you (until then they show a notice saying the operator has not);
- have the text checked against the law that applies to you (in Australia, the Privacy
  Act 1988 and your state's rules for schools), and add how long you keep backups;
- edit `web/src/features/legal/Privacy.tsx` and `Terms.tsx` if your copy differs, for
  example if you switch on AI question drafts or keep logs elsewhere.

Ludora removes sign-in records a week after they end, and guest accounts nobody can get
back into once they are 30 days old (`server/src/modules/users/retention.ts`, every six
hours).

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
