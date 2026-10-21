# Ludora

An educational game platform: teachers and players turn any question set into a
live game, play together with a 6-digit code or on their own, collect Glims and
cosmetics with what they earn, and teachers run classes with assignments and
reports. Nothing costs real money.

- 14 playable game modes with 28 variants, each passing an automated full-game
  test suite.
- Questions in 8 types (multiple choice, select all, true or false, short
  answer, number, ordering, matching, flashcards), 20 built-in sets.
- Server-authoritative realtime games with reconnection and host controls.
- An economy with disclosed Lantern odds, a ledger and idempotent purchases.
- Staff tools with server-enforced roles, an audit log and safe test accounts.

Status, what is verified and what is not built yet: [docs/STATUS.md](docs/STATUS.md).

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
