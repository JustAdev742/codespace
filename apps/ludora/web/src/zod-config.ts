/*
 * zod tries `new Function` once to see whether it may compile faster parsers.
 * The Content-Security-Policy forbids eval, so the attempt is blocked: zod
 * catches it and parses normally, but browsers report it as a policy
 * violation (Firefox logs it as an error). With `jitless` there is no attempt.
 *
 * zod reads its settings from this global when it loads and when each schema
 * is built (node_modules/zod/v4/core/core.js), so setting it here, first thing
 * in each entry point, covers every schema without pulling zod into the first
 * page load. If a zod upgrade renames it, the browser tests' CSP check fails.
 */
const g = globalThis as { __zod_globalConfig?: Record<string, unknown> };
g.__zod_globalConfig = { ...g.__zod_globalConfig, jitless: true };
