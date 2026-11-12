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

## Free hosting: Render and Neon

A way to put Ludora at a real `https://` address at no cost, for trying it with real devices.
It is not a school's day-to-day copy: read the limits first. Render runs the app on its free
plan and Neon keeps the database on its free plan (Postgres 16 or newer; Ludora has been run on
16 and on 18). Render's own free database is deleted 30 days after it is made, which is why the
database is at Neon.

**Limits** (from each company's documentation in November 2026; they change, so check):

- **It sleeps.** After 15 minutes with no visitors Render stops the app, and the next visitor
  waits about a minute while it starts. Open the address a few minutes before a lesson. A game
  in play keeps it awake.
- **It can restart.** Render may restart a free service at any time, and a restart ends any
  game in play. Finished games are safe: their results are in the database.
- **It is small.** A tenth of a CPU and 512 MB of memory. In *Measured capacity* below, Classic
  with 40 players used 3% of a core on average and 11% at most, and a 3D game with 40 players
  10% and 18%. So one class on a quiz game should be comfortable, and several classes at once
  or the busy 3D games may lag. This has not been measured on Render.
- **Uploads go in the database.** A free service has no disk that survives a restart or a
  sleep, so `render.yaml` sets `UPLOAD_STORE=db`: pictures and sound clips people upload are
  kept in the database instead (25 MB an account by default, counted in Neon's 1 GB). A service
  made before that setting existed needs `UPLOAD_STORE` = `db` added by hand in Render, under
  Environment; until then its uploads vanish at each restart. Everything else is in the
  database and stays.
- **Monthly allowances.** Render: 750 hours of running time, enough for one service all month.
  Neon: 1 GB of storage and 100 compute-hours for the project; its database also sleeps after
  5 minutes idle and wakes on the next request. Reaching a limit pauses the service until the
  next month; Neon says it does not delete your data.
- **Where the data is.** Two companies hold it. Render has no Australian region (Singapore is
  its nearest). Neon has one, Sydney: a database there stays in Australia, but every query then
  travels between Singapore and Sydney, which slows each page a little; a database in Singapore
  sits beside the app. Before real students' names go in, the school should agree to wherever
  it is. For a trial, the host option *Generated names* keeps names out altogether.
- **Backups are yours to take**: see *Backups and data*, using the Neon connection string.

**Steps** (about fifteen minutes, most of it the first build):

1. **The database.** Sign up at neon.com and make a project, in **AWS Asia Pacific (Singapore)**
   to sit beside the app or **(Sydney)** to keep it in Australia. Neon gives the database two
   addresses, and Ludora uses both: the direct one for its migrations, and the pooled one (its
   host name has `-pooler` in it) for everyday queries. Neon's console shows them as
   `DATABASE_URL` and `DATABASE_URL_POOLED`. They look like
   `postgresql://user:password@ep-example.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`.
   Treat both as passwords.
2. **The app.** Sign up at render.com with your GitHub account. New, then Blueprint, then this
   repository and the branch to run. Render reads `render.yaml` at the top of the repository
   and asks for two values, `DATABASE_URL` and `DATABASE_URL_POOLED`: paste the two Neon
   strings. (With only the first, everything goes over the direct address, which also works.)
   Apply, and wait for the build.
3. **Open it.** Render shows the address, `https://ludora-something.onrender.com`. The server
   takes its own address from Render (`RENDER_EXTERNAL_URL`), so there is no `PUBLIC_ORIGIN` to
   set unless you add a domain of your own. Sign up.
4. **The first administrator.** The free plan has no shell, so run the operator CLI from any
   computer that has this repository built (the Codespace does), pointing it at the database:
   ```bash
   cd apps/ludora
   DATABASE_URL='<the direct Neon string>' node server/dist/admin.js grant <username> superadmin --reason "first admin"
   ```
   If that checkout has the addresses in `.env.local` (see *Settings from a file* below), leave
   `DATABASE_URL=...` off: the command reads the file.
5. **Updates.** Nothing deploys by itself, because a deploy restarts the server. In Render,
   Manual Deploy, then Deploy latest commit, when no class is playing.

If your players are not in Australia or Asia, change `region` in `render.yaml` before the first
deploy (it cannot be changed afterwards) and make the Neon project in the same part of the world.

What has been checked: `render.yaml` against Render's published schema; the production server
run with Render's own variables (its port and its address variable), where a sign-up from the
`onrender.com` address is accepted with a secure cookie and one from another origin is refused;
and Ludora running on a real Neon database (Postgres 18.6, Sydney): all 19 migrations and the
content seed, an account, a question set, and a whole Classic game with a host and three
players over WebSockets, with the results then read back from Neon itself; queries went through
the pooled address and migrations through the direct one. That run was made from a machine
where the Postgres port is closed, so the connections were carried over Neon's WebSocket
endpoint. It has since been deployed for real: a free Render web service in Singapore, built
from this repository's Dockerfile, on that Neon database over its ordinary port. There, the
health check, the home page, the 30 modes, a sign-up at the `onrender.com` address (accepted,
with a secure cookie), the session read back, and a WebSocket connection all work. That
service was made with Render's "new web service" form rather than from `render.yaml`, with the
same settings; the Blueprint route itself has not been run. Not measured there: how many
players it carries.

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
| `DATABASE_URL_POOLED`, `DATABASE_URL_UNPOOLED` | no | For a host that gives one database two addresses (Neon does). The server sends its everyday queries to the pooled one and runs migrations, the seed and the operator CLI over the direct one. Either naming works: `DATABASE_URL` (direct) with `DATABASE_URL_POOLED`, as Neon's console shows them, or `DATABASE_URL` (pooled) with `DATABASE_URL_UNPOOLED`, as `neon env pull` writes them. All must name the same database, or the server refuses to start. |
| `PUBLIC_ORIGIN` | yes | The address people open, e.g. `https://play.example.org`. Used for CSRF and WebSocket origin checks; requests from other origins are refused. On Render it is taken from `RENDER_EXTERNAL_URL` when not set. |
| `IP_HASH_KEY` | yes in production | At least 16 random characters. IP addresses are only stored as keyed hashes. Production refuses the `change-me` and `dev-only` placeholders. |
| `CHAOS_SECRET` | no | At least 16 random characters (`openssl rand -hex 32`). Seeds the secret lantern's knock rhythm (see CHAOS.md); without it the rhythm is derived from `IP_HASH_KEY`. Keep it in the host's secret store or `.env`, never in the repository. Changing it changes the rhythm. |
| `SIGNUPS_PER_10_MIN`, `GUESTS_PER_10_MIN` | no | How many new accounts (default 40) and guests (default 60) one address may make in ten minutes; 5 to 5000. Everyone at a school usually shares one address, and so does everyone behind a tunnel or forwarded port, so raise these (for example to 600) on a school's own copy before several classes join at once. |
| `OPERATOR_NAME`, `OPERATOR_CONTACT` | before real use | Who runs this copy (a school, a trust, a company) and an email or address for privacy questions. The privacy policy and terms at `/privacy` and `/terms` name them; until they are set, those pages say the operator has not added contact details. |
| `SCHOOL_THEME` | no | A school's touches on its own copy, from the first paint: `hills-grammar` adds The Hills Grammar School's logo beside Ludora's, its typeface (Lato), its red and green as accents, and its uniform on every Glim, at the school's request. Unset keeps Ludora's look. An unknown name stops the server at startup. See [SCHOOL_LOOKS.md](SCHOOL_LOOKS.md), which also says how to add a school. |
| `APP_ENV` | no (production in the image) | See above. |
| `TRUST_PROXY` | behind a proxy | `true` when a reverse proxy sets `X-Forwarded-For`; needed for per-IP rate limits. |
| `COOKIE_SECURE` | no | Defaults to `true` in production. Only set `false` to try the image over plain http on your own machine. |
| `PORT`, `HOST` | no | Default `8787`, `0.0.0.0`. |
| `LOG_LEVEL` | no | `info` by default. Cookies and authorisation headers are redacted from logs. |
| `UPLOAD_DIR` | no | Where uploaded question images are kept. The image uses `/data/uploads`, which compose mounts as the `uploads` volume so images survive upgrades. |
| `UPLOAD_STORE` | no | `disk` (the default: files in `UPLOAD_DIR`) or `db` (files in the database). Use `db` on a host whose disk is wiped at every restart, such as Render's free plan, or uploaded pictures and sound clips vanish. Files already on disk keep being served either way, from the same addresses. |
| `UPLOAD_DB_ACCOUNT_BYTES`, `UPLOAD_DB_FILE_BYTES` | no | With `UPLOAD_STORE=db`: how much one account may keep in the database (default 25 MB) and the largest single file (default 700 KB; the editor shrinks pictures to fit before uploading). |
| `AI_PROVIDERS` | no | AI providers for the AI helpers, as a JSON list of services that speak the OpenAI chat-completions API (Groq, OpenRouter, Cerebras, Mistral and others): `[{"name":"Groq","baseUrl":"https://api.groq.com/openai/v1","apiKey":"...","models":[{"id":"llama-3.3-70b-versatile","label":"Llama 3.3 70B"}]}]`. Add `"jsonMode": false` for a provider that rejects JSON mode. Unset: no helpers. Keys stay on the server and are never shown, logged or sent to browsers. Staff then switch on `ai.helpers_teachers` and/or `ai.helpers_students` (`docs/features/ai.md`). |
| `ANTHROPIC_API_KEY` | no | Adds Anthropic as one more AI provider, alongside any in `AI_PROVIDERS`. It stays on the server and is never sent to browsers. |
| `ANTHROPIC_MODEL` | no | The Claude model used when `ANTHROPIC_API_KEY` is set. Default `claude-opus-5-5`. |
| `AI_DRAFTS_DAILY_LIMIT` | no | AI helper requests allowed across the whole site in any 24 hours, to cap use of a provider's own limit. Default 500. Staff can change it on the AI staff page without a redeploy; each account's own allowance (default 20 in any 5 hours) is set there too. |
| `AI_TIMEOUT_SEC` | no | How long one AI provider may take before Ludora gives up on it and tries the next model. Default 60. |
| `AI_PER_ADDRESS_10_MIN` | no | AI helper requests one address may make in ten minutes, across all its accounts. Default 60. |
| `SMTP_URL` | no | Unused: Ludora does not send email (D38). |

### Settings from a file

Run straight from a checkout (`npm run dev`, `npm start`, the operator CLI), the server also
reads `apps/ludora/.env.local` and then `apps/ludora/.env`, if they exist. A value already in
the environment always wins, `.env.local` wins over `.env`, and the database addresses are only
ever taken together from one place, so a file left on a machine cannot send a server that was
given its own `DATABASE_URL` to a second database. Both files are git-ignored and are kept out
of the Docker image.

This is where the Neon CLI puts a database's addresses. The project is linked in `neon.ts`
(what the Neon project should have: Postgres only) and `.neon` (which project and branch;
git-ignored). After `neon login`, `neon env pull` writes the addresses into `.env.local`.

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

### AI helpers, on a free AI service

The helpers in the making tools (drafting questions, wording, wrong answers, a lesson outline, a
mode for this set, "describe your game" in Game Maker, "describe a Glim" in My designs) work
with any service that speaks the OpenAI chat-completions API. Several have a free tier with no
card (Groq and OpenRouter, for example): you make one account there, players never see or sign
in to it, and the key stays on the server.

1. Make a key at the service and set `AI_PROVIDERS` (its shape is in the table above). More than
   one provider, and more than one model each, is fine: people get a model picker, and when one
   model is rate-limited the next is tried.
2. In the staff area, Feature flags: switch on `ai.helpers_teachers`, `ai.helpers_students`, or
   both. Guests never get helpers.
3. Each account gets 20 requests in any 5 hours by default, and the whole site has a cap per day
   so a free tier's limit is not spent by one class. Staff change both, and turn single models
   on and off, in the staff area (AI helpers); every change is audited.

A free tier's own limits still apply to the whole site at once, and its terms may require the
account holder to be an adult. Nothing here has been run against a live service: the helpers are
tested against a stand-in provider. [features/ai.md](features/ai.md) has the detail.

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
