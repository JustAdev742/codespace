import { eq } from 'drizzle-orm';
import { AI_REVIEW_DEFAULT_THRESHOLDS } from '@ludora/shared';
import type { Config } from '../../config.ts';
import type { DbOrTx } from '../../db/client.ts';
import { aiReviewSettings } from '../../db/schema.ts';
import { openKey } from './secret.ts';

export interface ReviewSettings {
  enabled: boolean;
  model: string;
  /** The model staff chose, if they did; else the environment's. */
  modelSetting: string | null;
  thresholds: Record<string, number>;
  /** Where the API key comes from: saved on the staff AI page, the environment, or nowhere. */
  keySource: 'saved' | 'environment' | 'none';
  keyHint: string | null;
  /** A saved key that this server cannot open (IP_HASH_KEY changed since it was saved). */
  keyUnreadable: boolean;
  updatedAt: string | null;
}

type ConfigPart = Pick<Config, 'ANTHROPIC_API_KEY' | 'AI_REVIEW_MODEL' | 'IP_HASH_KEY'>;

export async function loadReviewSettings(db: DbOrTx, config: ConfigPart): Promise<ReviewSettings> {
  const [row] = await db.select().from(aiReviewSettings).where(eq(aiReviewSettings.id, 'site'));
  const saved = row?.keyCipher ? openKey(row.keyCipher, config.IP_HASH_KEY) : null;
  const keySource = saved ? 'saved' : config.ANTHROPIC_API_KEY ? 'environment' : 'none';
  return {
    enabled: row?.enabled ?? false,
    model: row?.model ?? config.AI_REVIEW_MODEL,
    modelSetting: row?.model ?? null,
    thresholds: row?.thresholds ?? { ...AI_REVIEW_DEFAULT_THRESHOLDS },
    keySource,
    keyHint: saved ? (row?.keyHint ?? null) : config.ANTHROPIC_API_KEY ? `…${config.ANTHROPIC_API_KEY.slice(-4)}` : null,
    keyUnreadable: Boolean(row?.keyCipher && !saved),
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

/** The key the investigator calls the API with: a saved one first, else ANTHROPIC_API_KEY. Server-side only. */
export async function reviewApiKey(db: DbOrTx, config: ConfigPart): Promise<string | null> {
  const [row] = await db.select({ keyCipher: aiReviewSettings.keyCipher }).from(aiReviewSettings).where(eq(aiReviewSettings.id, 'site'));
  const saved = row?.keyCipher ? openKey(row.keyCipher, config.IP_HASH_KEY) : null;
  return saved ?? config.ANTHROPIC_API_KEY ?? null;
}

/** Whether a grant of this size is reviewed: at or above the threshold for its currency (none set: never). */
export function grantNeedsReview(settings: Pick<ReviewSettings, 'enabled' | 'thresholds'>, currency: string, total: number): boolean {
  const limit = settings.thresholds[currency];
  return settings.enabled && typeof limit === 'number' && limit > 0 && total >= limit;
}
