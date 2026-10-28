import { z } from 'zod';

/**
 * Runtime configuration from environment variables. Everything has a safe
 * development default except where running without a value would be unsafe
 * in production (those fail at startup instead).
 */

export const APP_ENVS = ['development', 'test', 'sandbox', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

const bool = z
  .string()
  .optional()
  .transform((v) => (v === undefined ? undefined : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const schema = z.object({
  APP_ENV: z.enum(APP_ENVS).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('postgres://postgres:postgres@localhost:5432/ludora'),
  /** The address people open in a browser, e.g. https://play.example.com. Used for CSRF and socket origin checks. */
  PUBLIC_ORIGIN: z.string().url().default('http://localhost:5173'),
  /** Extra allowed origins, comma separated (e.g. the Vite dev server and the API port). */
  EXTRA_ORIGINS: z.string().default('http://localhost:8787,http://127.0.0.1:5173,http://127.0.0.1:8787'),
  COOKIE_SECURE: bool,
  /** Set when running behind a reverse proxy so client IPs come from X-Forwarded-For. */
  TRUST_PROXY: bool,
  /** Key for hashing IP addresses before they are stored. */
  IP_HASH_KEY: z.string().min(16).default('dev-only-ip-hash-key-change-me'),
  UPLOAD_DIR: z.string().default('./uploads'),
  /** Built web app to serve (production). */
  WEB_DIST: z.string().default('../web/dist'),
  /** Built files served only to signed-in accounts that are allowed them (the chaos menu). Never served statically. */
  WEB_PRIVATE_DIST: z.string().default('../web/dist-private'),
  /** Seeds the secret chaos sequence (the knock rhythm). Defaults to one derived from IP_HASH_KEY, so it differs per deployment. */
  CHAOS_SECRET: z.string().min(16).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Turns on AI question drafts (with the ai.question_drafts flag). */
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-opus-5-5'),
  /** AI draft requests allowed across the whole site in any 24 hours, to cap spending. */
  AI_DRAFTS_DAILY_LIMIT: z.coerce.number().int().min(0).default(500),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('Ludora <no-reply@ludora.local>'),
});

export type Config = z.infer<typeof schema> & {
  allowedOrigins: string[];
  cookieSecure: boolean;
  trustProxy: boolean;
  /** Sandbox and development allow test conveniences such as unlimited currency for any test account. */
  isSandbox: boolean;
  isProduction: boolean;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  const c = parsed.data;
  const isProduction = c.APP_ENV === 'production';
  if (isProduction && c.IP_HASH_KEY.startsWith('dev-only')) throw new Error('Set IP_HASH_KEY to a long random value in production.');
  const allowedOrigins = [c.PUBLIC_ORIGIN, ...c.EXTRA_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)];
  return {
    ...c,
    allowedOrigins: isProduction ? [c.PUBLIC_ORIGIN] : [...new Set(allowedOrigins)],
    cookieSecure: c.COOKIE_SECURE ?? isProduction,
    trustProxy: c.TRUST_PROXY ?? false,
    isSandbox: c.APP_ENV !== 'production',
    isProduction,
  };
}
