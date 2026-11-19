# The economy: an economy manager role, the economy room, class rewards and the Wallet

19 November 2026, decision D58 in [../DECISIONS.md](../DECISIONS.md). Migration `0024_economy` (sale columns
and `featured` on `shop_listings`, `refunded_at` and `refunded_by` on `purchases`, a new `class_rewards` table).
No new dependencies. In-game currency only: Sparks, Moonstones and Dust are earned by playing, and nothing here
touches real money.

Tests named below: `server/test/economist.test.ts` (22 tests), the authorisation matrix in
`server/test/admin.test.ts` (now with the economist role and the eleven new endpoints),
`web/src/features/wallet/walletLogic.test.ts` (4), and `e2e/economy-manager.spec.ts` (3 browser tests in
Chromium, axe WCAG 2.2 A/AA on the economy room's health, sales and grants, the class's Rewards tab and the
Wallet at 390 px, with no console errors). `e2e/staff.spec.ts` now also opens the Shop and sales and History tabs.

## Features built

| # | What a person now sees or can do | Where | How it was verified |
|---|---|---|---|
| 1 | **Economy manager role** (`economist`): the staff area with only the economy (view, change rules, grant and refund, the shop and economy events). No players' records, moderation, roles, system, security or audit pages. Only an administrator or above grants it. | `packages/shared/src/permissions.ts` | "holds the economy permissions and nothing else", "is granted only by an administrator", "opens every economy page", "is refused on every page outside the economy"; the matrix in `admin.test.ts`; e2e test 1 (staff menu, `/staff/users` says not available, four APIs refuse) |
| 2 | **Daily grant total** for an economy manager, per currency (20,000 Sparks, 1,000 Moonstones, 10,000 Dust, 2,000 other by default), counted from the audit log under a lock so two grants at once cannot both slip under. Only an administrator (`economy.limits`) changes it; administrators are not held to it. No grants to one's own account. | `server/src/modules/admin/grantLimits.ts`, `economyRoom.ts` (`/limits`), `GrantLimitsCard` | "daily grant total" tests (up to, refused past, per person, admin raises it, removals do not count, four grants at once give three); "cannot grant to their own account"; e2e test 2 |
| 3 | **Health tab**: earned and spent per day for any currency with a sentence above each table, where it came from and went by reason, Sparks in bands with the median (counts only), most and least bought, players reaching the daily game limit each day and today, Lantern odds told and drawn. | `economyRoom.ts` (`/health`), `features/admin/economyRoom.tsx` (`HealthTab`) | "counts real ledger movement..." test (today's figure equals a direct ledger query, bands add up, no username in the payload); e2e test 1 (axe, screenshot) |
| 4 | **Rules preview**: while editing, what six example games pay under the new rules beside the old, with the sentence kept in the save bar ("a player who answers 8 of 10 and comes 2nd of 5 earns 108 Sparks instead of 92") and games needed to reach the daily limit. The same maths the server pays with. | `server/src/modules/economy/preview.ts`, `/rules/preview`, `RulesPreviewCard` | "pays what computeGameReward pays" and "previews a change, saves it..." tests; e2e test 1 |
| 5 | **Rule history with a one-step undo**: each change with who, when, why and what changed; the newest can be undone, which is itself recorded. | `/rules/history`, `/rules/undo`, `RulesHistoryCard` | "previews a change, saves it, lists it and undoes it" (older change refused, moderator refused); e2e test 1 |
| 6 | **Class rewards budget in the rules** (weekly budget per class, most per student at a time), editable with the other rules. | `economy/config.ts` (`classRewards`), `RULE_GROUPS` | "keeps the class budget and boost when an older form saves rules without them" |
| 7 | **Sales**: a sale price between two dates on any listing (lower than the price, at most 31 days), ended early in one step; players pay the sale price and see "On sale until Friday" beside the old price crossed out, never a countdown. | `/sales/:id`, `/sales/:id/end`, `shop/service.ts` (`saleActive`, `effectivePrice`), `SalesTab`, `Shop.tsx` (`SaleNote`) | "runs a sale players pay..." test; e2e test 1 (sets a sale, the shop card says so) |
| 8 | **Featured listings and prices** from the economy room: feature or unfeature any listing (it joins the shop's Featured tab), change a price, with a reason each time. | `catalog.ts` (`featured`), `SalesTab` dialogs, `Shop.tsx` | same test (featured shows in `/api/shop`, audit rows) |
| 9 | **Refunds**: a purchase's price goes back and its items come off the player, once, idempotent and audited; refunded purchases stop counting towards limits. Lanterns cannot be refunded (the draw happened). | `/purchases`, `/refund`, `RefundsCard` | "gives back the price, takes the item back, frees the limit, and only once"; "refuses Lanterns, own purchases and roles without grants" |
| 10 | **Grant to a whole class** from the economy room: find a class, the same amount to each student, the class name typed to confirm, counted as one total towards the daily limit. | `/classes`, `/grant-class`, `ClassGrantCard` | "class grants from the economy room" test (confirm needed, replay safe, staff who are students refused) |
| 11 | **An account finder for grants** that returns only a name and kind, so an economy manager can grant without player records. | `/accounts`, `AccountSearch` in `Economy.tsx` | "opens every economy page"; e2e test 2 finds the player |
| 12 | **Ledger as CSV** with the table's filters (up to 5,000 rows), safe against spreadsheet formulas, and the download recorded in the audit log. | `/ledger.csv`, `LedgerCsvLink` | "downloads one account's history as CSV and records the download"; `csvCell` unit test |
| 13 | **History tab**: the economy's own part of the audit log (grants, refunds, rules, limits, prices, sales, currencies, events), the only part an economy manager can read. | `/activity`, `ActivityTab` | "sees only the economy part of the audit log" |
| 14 | **Class rewards for teachers**: a Rewards tab on a class to give Sparks to one student or the whole class with a reason (quick reasons offered), out of the weekly budget, with each student's total this week and the latest awards. Students cannot give anything to each other. | `server/src/modules/classes/rewards.ts`, `web/src/features/classes/ClassRewards.tsx` | "class rewards" test (budget, per-student limit, over budget refused with a sentence, a student refused, someone outside the class refused); budget maths unit test; e2e test 3 |
| 15 | **Wallet** (`/wallet`, one line in the sidebar and in search): balances, today's game Sparks against the limit, a saving goal chosen from the wishlist with progress, and every Spark in and out, newest first, grouped by day, with the teacher's name and reason on class rewards and the item's name on purchases. | `server/src/modules/economy/wallet.ts`, `web/src/features/wallet/Wallet.tsx` | "the Wallet" test (goal only from the wishlist, cleared when taken off it); e2e test 3 at 390 px (axe, no sideways scroll) and 1440 px |

## Extras added after reading the code

| # | What | Where | How it was verified |
|---|---|---|---|
| 16 | **Sparks boost**, an economy event: game Sparks multiplied (1.1 to 3) between two dates of at most 14 days, still up to the same daily limit, set with the rules (so it is previewed, recorded and can be undone). Players see "Double Sparks weekend: ... until Sunday" on the Wallet and a line on the results screen. | `economy/config.ts` (`boost`, `activeBoost`), `progression/rewards.ts`, `BoostCard` | "multiplies game Sparks during a boost, never past the daily cap" (also refuses 15 days and x5) |
| 17 | **This week on the Wallet**: Sparks earned so far this week by where they came from, last week's total and what was spent, in one sentence and a short list. | `wallet.ts` (`sparksBetween`), `Wallet.tsx` | "the Wallet" test (week total); `weekLine` unit test |
| 18 | **Sale prices in the buy dialog**: "Price (on sale)" with the usual price crossed out, and screen readers hear "on sale, usually 20" on the Buy button. | `Shop.tsx` (`ConfirmBody`, `PriceButton`) | e2e test 1 (shop card); `tsc` |
| 19 | **Calm end dates**: "until today", "until tomorrow", "until Friday", "until 3 December", one helper for every sale and boost, so nothing in the economy ticks down. | `web/src/lib/format.ts` (`calmUntil`) | `walletLogic.test.ts` ("never counts down") |

A "what can I afford" filter and bundles already existed in the shop, so they were not built again.

## Already existed (not counted)

The ledger, idempotent purchases, staff grants and removals with per-change caps, the rules form, currencies,
the shop admin, events, the wishlist, the "What I can afford" filter, bundles, and school merits (which earn
house points and never currency, and still do).

## Not done

- The health tab has tables with thin bars, not charts: the project has no charting library.
- The daily game limit used for past days is today's limit (the ledger does not store the limit in force then).
- Grants and refunds of items to a whole class, and refunds of Lanterns, are not offered.
- Not tried with a real class or by a person with a screen reader. Only Chromium ran the new browser tests.
