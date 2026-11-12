import { z } from 'zod';

/**
 * Runtime configuration from environment variables. Everything has a safe
 * development default except where running without a value would be unsafe
 * in production (those fail at startup instead).
 */

export const APP_ENVS = ['development', 'test', 'sandbox', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

/** School looks a copy of Ludora can switch on: the school's own colours and font (web/src/styles/schools.css). */
export const SCHOOL_THEMES = ['hills-grammar'] as const;
export type SchoolTheme = (typeof SCHOOL_THEMES)[number];

const bool = z
  .string()
  .optional()
  .transform((v) => (v === undefined ? undefined : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

/** One OpenAI-compatible AI provider, from AI_PROVIDERS. */
const aiProviderSchema = z.object({
  name: z.string().trim().min(1).max(40),
  baseUrl: z.string().url().refine((u) => /^https?:\/\//.test(u), 'must start with http:// or https://'),
  apiKey: z.string().max(500).optional(),
  models: z
    .array(z.union([z.string().trim().min(1).max(120), z.object({ id: z.string().trim().min(1).max(120), label: z.string().trim().min(1).max(60).optional() })]))
    .min(1)
    .max(20),
  /** Send response_format json_object. Leave it on unless the provider rejects it; Ludora asks for JSON in the prompt either way. */
  jsonMode: z.boolean().default(true),
});
export type AiProviderConfig = z.infer<typeof aiProviderSchema>;

const schema = z.object({
  APP_ENV: z.enum(APP_ENVS).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('postgres://postgres:postgres@localhost:5432/ludora'),
  /**
   * Some hosts give one database two addresses: one through a connection pooler, for an app's
   * everyday queries, and a direct one, for migrations and admin work (a pooler in transaction
   * mode cannot do those). Neon's console names them DATABASE_URL (direct) and DATABASE_URL_POOLED;
   * `neon env pull` names them DATABASE_URL (pooled) and DATABASE_URL_UNPOOLED. Either pair works
   * here, and DATABASE_URL alone works as it always has. See `databaseUrl` and `directDatabaseUrl`.
   */
  DATABASE_URL_POOLED: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  DATABASE_URL_UNPOOLED: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  /** The address people open in a browser, e.g. https://play.example.com. Used for CSRF and socket origin checks. */
  PUBLIC_ORIGIN: z.string().url().default('http://localhost:5173'),
  /** Extra allowed origins, comma separated (e.g. the Vite dev server and the API port). */
  EXTRA_ORIGINS: z.string().default('http://localhost:8787,http://127.0.0.1:5173,http://127.0.0.1:8787'),
  COOKIE_SECURE: bool,
  /** Set when running behind a reverse proxy so client IPs come from X-Forwarded-For. */
  TRUST_PROXY: bool,
  /** Key for hashing IP addresses before they are stored. */
  IP_HASH_KEY: z.string().min(16).default('dev-only-ip-hash-key-change-me'),
  /**
   * How many new accounts, and how many guests, one address may make in ten minutes. A whole school
   * usually reaches the internet from one address, so a school's own copy needs more than the
   * defaults when several classes join at once. There is always a limit: it cannot be switched off.
   */
  SIGNUPS_PER_10_MIN: z.coerce.number().int().min(5).max(5000).default(40),
  GUESTS_PER_10_MIN: z.coerce.number().int().min(5).max(5000).default(60),
  UPLOAD_DIR: z.string().default('./uploads'),
  /** Built web app to serve (production). */
  WEB_DIST: z.string().default('../web/dist'),
  /** The playable demo (one browser, bots, no accounts), served at /demo/ when it has been built (`npm run build:demo`). */
  WEB_DEMO_DIST: z.string().default('../web/dist-demo'),
  /** Built files served only to signed-in accounts that are allowed them (the chaos menu). Never served statically. */
  WEB_PRIVATE_DIST: z.string().default('../web/dist-private'),
  /** Seeds the secret chaos sequence (the knock rhythm). Defaults to one derived from IP_HASH_KEY, so it differs per deployment. */
  CHAOS_SECRET: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(16).optional()),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Adds Anthropic as an AI provider, alongside any in AI_PROVIDERS. */
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-opus-5-5'),
  /** AI helper requests allowed across the whole site in any 24 hours, to cap spending. Staff can change it on the AI page. */
  AI_DRAFTS_DAILY_LIMIT: z.coerce.number().int().min(0).default(500),
  /**
   * AI providers that speak the OpenAI chat-completions API (Groq, OpenRouter, Cerebras, Mistral
   * and others), as a JSON list: [{"name":"Groq","baseUrl":"https://api.groq.com/openai/v1",
   * "apiKey":"...","models":["llama-3.3-70b-versatile"]}]. A model can be {"id":"...","label":"Plain name"}.
   * Unset: no AI helpers (an ANTHROPIC_API_KEY still adds Anthropic). Keys never leave the server.
   */
  AI_PROVIDERS: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()).transform((v, ctx) => {
    if (v === undefined) return [];
    let raw: unknown;
    try {
      raw = JSON.parse(v);
    } catch {
      // Never repeat the value: it holds keys.
      ctx.addIssue({ code: 'custom', message: 'AI_PROVIDERS must be a JSON list of providers.' });
      return z.NEVER;
    }
    const parsed = z.array(aiProviderSchema).max(10).safeParse(raw);
    if (!parsed.success) {
      ctx.addIssue({ code: 'custom', message: `AI_PROVIDERS: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}` });
      return z.NEVER;
    }
    return parsed.data;
  }),
  /** How long one AI provider may take to answer before Ludora gives up on it, in seconds. */
  AI_TIMEOUT_SEC: z.coerce.number().int().min(1).max(300).default(60),
  /** AI helper requests one address may make in ten minutes, whichever accounts make them. */
  AI_PER_ADDRESS_10_MIN: z.coerce.number().int().min(1).max(5000).default(60),
  /** Who runs this copy of Ludora and how to reach them, shown on the privacy policy and terms. */
  OPERATOR_NAME: z.preprocess((v) => (v === '' ? undefined : v), z.string().max(120).optional()),
  OPERATOR_CONTACT: z.preprocess((v) => (v === '' ? undefined : v), z.string().max(200).optional()),
  /** A school's look for this copy, e.g. hills-grammar. Unset: Ludora's own. */
  SCHOOL_THEME: z.preprocess((v) => (v === '' ? undefined : v), z.enum(SCHOOL_THEMES).optional()),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('Ludora <no-reply@ludora.local>'),
});

export type Config = z.infer<typeof schema> & {
  /** Where the running server sends its queries: the pooled address when the host gives one. */
  databaseUrl: string;
  /** Where migrations, the content seed and the operator CLI connect: always a direct connection. */
  directDatabaseUrl: string;
  allowedOrigins: string[];
  cookieSecure: boolean;
  trustProxy: boolean;
  /** Sandbox and development allow test conveniences such as unlimited currency for any test account. */
  isSandbox: boolean;
  isProduction: boolean;
};

/** The database a connection string names, or null when it is not a URL (a socket path, say). Never the password. */
function databaseName(url: string): string | null {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, '')) || null;
  } catch {
    return null;
  }
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  // Render tells a web service its own address. Use it when PUBLIC_ORIGIN is not set, so a first deploy
  // there answers at its onrender.com address without a second step; a PUBLIC_ORIGIN that is set (a
  // custom domain) always wins.
  const onRender = !env.PUBLIC_ORIGIN && env.RENDER_EXTERNAL_URL ? { ...env, PUBLIC_ORIGIN: env.RENDER_EXTERNAL_URL } : env;
  const parsed = schema.safeParse(onRender);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  const c = parsed.data;
  const isProduction = c.APP_ENV === 'production';
  // Production never runs on a value that is published in this repository: the IP hashes and the
  // chaos knock rhythm are only as private as these keys.
  const placeholder = (v: string) => /^(dev-only|change-me)/i.test(v);
  if (isProduction && placeholder(c.IP_HASH_KEY)) throw new Error('Set IP_HASH_KEY to a long random value in production.');
  if (isProduction && c.CHAOS_SECRET !== undefined && placeholder(c.CHAOS_SECRET)) throw new Error('Set CHAOS_SECRET to a long random value, or leave it unset.');
  const allowedOrigins = [c.PUBLIC_ORIGIN, ...c.EXTRA_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)];
  const databaseUrl = c.DATABASE_URL_POOLED ?? c.DATABASE_URL;
  const directDatabaseUrl = c.DATABASE_URL_UNPOOLED ?? c.DATABASE_URL;
  // The two addresses must be one database. Settings gathered from two places (a file for one, the
  // environment for the other) could otherwise migrate one database and then run on another.
  const [named, direct] = [databaseName(databaseUrl), databaseName(directDatabaseUrl)];
  if (named && direct && named !== direct) {
    throw new Error(`The database addresses name different databases ("${direct}" and "${named}"). Set DATABASE_URL, DATABASE_URL_POOLED and DATABASE_URL_UNPOOLED from the same place.`);
  }
  return {
    ...c,
    databaseUrl,
    directDatabaseUrl,
    allowedOrigins: isProduction ? [c.PUBLIC_ORIGIN] : [...new Set(allowedOrigins)],
    cookieSecure: c.COOKIE_SECURE ?? isProduction,
    trustProxy: c.TRUST_PROXY ?? false,
    isSandbox: c.APP_ENV !== 'production',
    isProduction,
  };
}
