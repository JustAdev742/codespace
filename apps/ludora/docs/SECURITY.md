# Ludora security model

What Ludora protects, how, and where each protection lives in the code. Report
a security problem privately to the maintainers rather than in a public issue.

## Principles

1. **The server decides.** Permissions, prices, odds, grades, scores and rewards
   are computed on the server. The browser only displays what the server sends
   and asks it to act.
2. **Nothing special is unlocked from the client.** No staff rights, balances or
   test entitlements can be obtained by editing JavaScript, changing a request,
   guessing a URL or setting a flag in the browser.
3. **Every privileged change has an owner and a reason.** Staff changes are
   permission-checked, rate limited, confirmed where destructive, and written to
   the audit log in the same transaction.
4. **Children's safety first.** No free-text chat, safer defaults for under-13s,
   reports that cannot be used to probe accounts, blocks that work both ways.

## Accounts and sessions

- Passwords and recovery codes: Argon2id (19 MiB, 2 passes). Unknown usernames
  are verified against a dummy hash so timing does not reveal which exist
  (`server/src/modules/auth/service.ts`).
- Lockout after repeated failed sign-ins; staff with `users.edit` can clear it.
- Sessions: a random 256-bit token in an HttpOnly, SameSite=Lax cookie, Secure in
  production. Only its SHA-256 is stored, so a database leak does not leak
  sessions. Sessions expire after 30 days of inactivity and are revoked on
  password change, recovery, suspension and ban.
- Recovery: a one-time recovery code shown at sign-up; support can issue a new one
  (which signs the account out everywhere) only for accounts they outrank.

## Requests

- **CSRF**: every state-changing `/api` request needs the `x-ludora-csrf: 1`
  header, which a cross-site form or image cannot send without a CORS preflight
  that the server never answers, and the `Origin` header, when present, must be
  an allowed origin (`server/src/http/plugins.ts`). WebSocket connections check
  the origin too.
- **Validation**: every body, query and parameter is parsed with a zod schema;
  failures return field-level messages and nothing else runs.
- **Rate limits**: a global per-IP limit, tighter limits on sign-in, sign-up,
  purchases, reports and room creation, per-account limits on staff writes, and
  per-socket event budgets plus per-IP join limits for game rooms (room codes
  cannot be brute-forced quickly).
- **Headers**: a strict Content Security Policy (scripts from self only, no
  inline scripts, no framing, images from self and data/blob only), HSTS in
  production, `nosniff`.
- **Errors**: one JSON shape for every error; unexpected errors return a generic
  message and are stored, trimmed and without request bodies, for staff.

## Games

- Answers never leave the server before they are revealed: views are built per
  player, choices are referred to by positional tokens instead of authored ids,
  and the conformance suite inspects every view of every mode for leaked answers.
- Actions carry ids and are de-duplicated, so a retry never counts twice.
- Host commands are only accepted from the host's socket (or the owner of a solo
  room); player names are filtered; hosts can remove players and lock rooms.
- Reconnect tokens are random and only ever sent to their own player.

## Economy

- Amounts are integers. Every balance change locks the wallet row, writes the
  ledger with the balance after, and is backed by CHECK constraints so a bug
  cannot write a negative balance or item count.
- Purchases, Lantern openings and claims are idempotent per request key (ten
  parallel purchases against a balance for three charge exactly three; tested).
- Lantern odds shown to players are computed from the same drop table the server
  rolls against, with a cryptographic random source. Observed draws can be
  compared with the disclosed odds in the staff area.
- Rewards count each question once, never count self-graded answers as correct,
  and are capped per game and per day.

## Roles and staff tools

- Roles are stored per account; permissions come from a fixed table in
  `packages/shared/src/permissions.ts`. Every staff endpoint calls
  `staff(req, permission)` (`server/src/modules/admin/common.ts`), which also
  refuses guest sessions. A 7-role authorisation matrix over every staff endpoint
  is part of the test suite (`server/test/admin.test.ts`).
- Staff act on an account only if they outrank it and it is not their own; roles
  can only be granted below one's own (super administrators excepted); the last
  super administrator cannot be removed.
- The first super administrator is created with the operator CLI on the server.
- Typed confirmations for destructive actions are checked by the server.
- Grants to real accounts are capped per currency and need typed confirmation;
  staff can never grant to themselves.

## Test accounts and environments

- A test account is a flag only staff can set. Testers create fresh ones;
  converting an existing account needs a super administrator.
- Unlimited currency requires a test account and an active, expiring
  entitlement. In production only super administrators can grant it, and QA
  scenarios are refused; in sandbox and development testers can use both.
- Test accounts are labelled everywhere in staff views and left out of
  leaderboards and economy analytics.
- There are no debug routes, mock identities or backdoors. The debug overlay in
  rooms only shows what the viewer's browser already has, and appears only when
  the `debug.overlay` flag is on for them.

## Privacy

- Public views (leaderboards, room views, profiles, invite links) show display
  names, levels and avatars, never usernames, emails or account details. Global
  leaderboards do not include account ids.
- Emails are masked for staff without `users.edit`.
- IP addresses are stored only as keyed hashes; logs redact cookies and
  authorisation headers.
- Profile visibility (public, friends, private), who can send friend requests,
  and leaderboard appearance are the player's choice.
- Reports and friend-request refusals never reveal whether an account exists or
  who blocked whom.

## Known limits

- One API process holds live rooms; see DEPLOYMENT.md for scaling notes.
- Image uploads are not built; question images are restricted to Ludora's own
  upload path by schema and by the content security policy.
- No email delivery yet, so no email verification.
