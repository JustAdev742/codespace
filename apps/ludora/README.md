# Ludora

An educational game platform: teachers and players turn any question set into a
live game, play together with a 6-digit code or on their own, collect Glims and
cosmetics with what they earn, and teachers run classes with assignments and
reports. Nothing costs real money.

- 14 playable game modes with 70 variants, each variant a real rule change, and
  every one passing an automated full-game test suite.
- Questions in 8 types (multiple choice, select all, true or false, short
  answer, number, ordering, matching, flashcards), 20 built-in sets, picture
  uploads, and optional AI drafts (with an Anthropic API key) that teachers
  review before saving.
- Server-authoritative realtime games with reconnection and host controls.
- An economy with disclosed Lantern odds, a ledger and idempotent purchases.
- Staff tools with server-enforced roles, an audit log and safe test accounts.

Status, what is verified and what is not built yet: [docs/STATUS.md](docs/STATUS.md).

## Try it in a Codespace

The quickest way to try everything, with nothing to install:

1. On the repository's GitHub page choose **Code**, then **Codespaces**, then
   **Create codespace** on the branch that has Ludora.
2. Wait while it installs and builds: a few minutes the first time. A Ludora
   tab opens when it is ready; if your browser blocks it, open the **Ports**
   tab and open port 8787.
3. Sign up in the app, then make your account a super administrator in the
   Codespace's terminal:

   ```bash
   cd apps/ludora && npm run admin -- grant <username> superadmin --reason "testing"
   ```

4. To let other people join from their own devices, right-click port 8787 in
   the **Ports** tab and set **Port visibility** to **Public**. Anyone with the
   address can then reach it, so set it back to Private when you are done.

The Codespace runs the production build with its own Postgres (see
`.devcontainer/` at the repository root). The server log is at
`~/.ludora/server.log`, and `bash .devcontainer/start.sh` restarts it. A
stopped Codespace keeps its data and starts Ludora again when it wakes.

## Play the demo on GitHub Pages

A playable demo that needs no server: a whole game runs in the browser against
practice bots, with every mode, the built-in question sets, the big-screen view,
reactions, sound and music. Accounts, rewards, Lanterns, the shop, classes and
the staff tools need the server, so they are not in it, and nothing in it is
saved. It runs the server's own game room inside the page, and nothing it does
can reach a Ludora server, an account or a database.

To publish it, once:

1. Merge the branch that has Ludora into `main`.
2. In the repository's **Settings**, open **Pages** and set **Source** to
   **GitHub Actions**.
3. In **Actions**, open **Ludora demo on Pages** and choose **Run workflow**.

It goes live at `https://<owner>.github.io/<repository>/`. After that, every
push to `main` that changes Ludora publishes it again. A Pages site is public,
even for a private repository.

To build and try it on your own computer:

```bash
cd apps/ludora
npm run build:demo                # writes web/dist-demo
npm run preview:demo -w @ludora/web   # serves it on http://localhost:4174
```

## Run it locally

You need Node.js 22.12 or newer and PostgreSQL 16.

```bash
cd apps/ludora
npm install
npm run db:migrate
npm run db:seed
npm run dev              # API on http://localhost:8787, web on http://localhost:5173
```

`DATABASE_URL` defaults to `postgres://postgres:postgres@localhost:5432/ludora`.
Create an account in the app, then make it the first super administrator:

```bash
npm run admin -- grant <username> superadmin --reason "first admin"
```

## Check it

```bash
npm run check        # typecheck, lint and every test
npm run build        # production build of the web app and the server
npm run test:e2e     # browser tests against the production build (needs Postgres)
npm run test:demo    # browser tests of the playable demo (no server needed)
```

Server tests create and drop their own databases; set
`TEST_DATABASE_ADMIN_URL` if your Postgres is not at the default address.

## Documentation

| | |
|---|---|
| [docs/STATUS.md](docs/STATUS.md) | What works, what is being built, what is not built. |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Why things are the way they are. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Packages, engine, server, web app and data model. |
| [docs/GAME_MODE_SDK.md](docs/GAME_MODE_SDK.md) | How to write a game mode and what it must pass. |
| [docs/SECURITY.md](docs/SECURITY.md) | The security model. |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Docker, configuration, environments, operations. |
