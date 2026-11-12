import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { ZodType } from 'zod';
import type { AiModelOption } from '@ludora/shared';
import { aiFailures } from '../../db/schema.ts';
import { extractJson, ProviderError, type AiModel, type ChatMessage, type ProviderFailure } from './providers.ts';
import { removePersonalDetails } from './privacy.ts';
import { failsFilter, TaskReject, type AiTask, type AiTaskContext } from './tasks.ts';

/*
 * Runs one task: builds its prompt on the server, takes personal details out,
 * asks the person's chosen model (and, if they allowed it, the next enabled
 * model when one is busy, slow or down), reads the JSON defensively, asks
 * once more with the error when the answer does not fit, checks it against
 * the task's rules and the word filter, and only then returns it.
 */

/** Why a run produced nothing usable, in terms the route can explain. */
export type RunFailure = ProviderFailure | 'invalid' | 'filtered';

export class RunError extends Error {
  constructor(
    readonly kind: RunFailure,
    message: string = kind,
    readonly retryAfterSec?: number,
    readonly model?: AiModel,
    readonly usage?: { inputTokens: number; outputTokens: number },
  ) {
    super(message);
    this.name = 'RunError';
  }
}

export interface RunResult<O> {
  output: O;
  model: AiModelOption;
  provider: string;
  removed: number;
  dropped: number;
  usage: { inputTokens: number; outputTokens: number };
}

/* -------- Busy providers wait out their retry-after before being asked again (per process). -------- */

const coolingUntil = new Map<string, number>();

export function clearCooldowns() {
  coolingUntil.clear();
}

const coolingFor = (provider: string, now = Date.now()) => Math.max(0, Math.ceil(((coolingUntil.get(provider) ?? 0) - now) / 1000));

/** The models to try, in order: the person's choice first, then (if they allow it) the rest. */
export function modelOrder(enabled: readonly AiModel[], chosen: string | undefined, fallback: boolean): AiModel[] {
  const first = enabled.find((m) => m.id === chosen) ?? enabled[0];
  if (!first) return [];
  return fallback ? [first, ...enabled.filter((m) => m !== first)] : [first];
}

const schemaCache = new WeakMap<object, Record<string, unknown> | null>();
function jsonSchemaOf(schema: ZodType): Record<string, unknown> | undefined {
  if (!schemaCache.has(schema)) {
    try {
      schemaCache.set(schema, betaZodOutputFormat(schema as never).schema as Record<string, unknown>);
    } catch {
      schemaCache.set(schema, null);
    }
  }
  return schemaCache.get(schema) ?? undefined;
}

const JSON_RULE = (example: string) =>
  `\n\nAnswer with one JSON object and nothing else: no explanation before or after it, no code fences. It must have this shape:\n${example}`;

/** A short, model-readable account of why an answer did not fit, for the repair attempt. */
function problemText(err: unknown): string {
  if (err instanceof SyntaxError) return 'It was not valid JSON.';
  if (err instanceof TaskReject) return err.message;
  const issues = (err as { issues?: { path: PropertyKey[]; message: string }[] }).issues;
  if (issues?.length)
    return issues
      .slice(0, 6)
      .map((i) => `${i.path.map(String).join('.') || 'the answer'}: ${i.message}`)
      .join('; ');
  return 'It did not match the shape asked for.';
}

export async function runTask<I, P, W, O>(task: AiTask<I, P, W, O>, prepared: P, models: AiModel[], ctx: AiTaskContext): Promise<RunResult<O>> {
  const built = task.prompt(prepared);
  const { text: user, removed } = removePersonalDetails(built.user);
  const system = built.system + JSON_RULE(task.example);
  const jsonSchema = jsonSchemaOf(task.output as ZodType);
  const maxTokens = task.maxTokens ?? 2000;
  let last: RunError | null = null;
  const usage = { inputTokens: 0, outputTokens: 0 };

  for (const model of models) {
    const wait = coolingFor(model.provider);
    if (wait > 0) {
      last = new RunError('busy', `${model.provider} is cooling down`, wait, model);
      continue;
    }
    const messages: ChatMessage[] = [{ role: 'user', content: user }];
    try {
      for (let attempt = 0; ; attempt++) {
        const answer = await model.complete({ system, messages, maxTokens, ...(jsonSchema ? { jsonSchema } : {}) });
        usage.inputTokens += answer.usage.inputTokens;
        usage.outputTokens += answer.usage.outputTokens;
        try {
          const wire = task.output.parse(extractJson(answer.text));
          const { output, dropped = 0 } = await task.validate(wire, prepared, ctx);
          if (failsFilter(output)) throw new RunError('filtered', 'The answer did not pass the word filter.', undefined, model, usage);
          return { output, model: { id: model.id, label: model.label, provider: model.provider }, provider: model.provider, removed, dropped, usage };
        } catch (err) {
          if (err instanceof RunError) throw err;
          if (attempt >= 1) throw new RunError('invalid', `Unusable after a repair attempt: ${problemText(err)}`, undefined, model, usage);
          // One more try on the same model, with the problem fed back.
          messages.push({ role: 'assistant', content: answer.text.slice(0, 8000) }, { role: 'user', content: `That answer could not be used. ${problemText(err)} Answer again with only the corrected JSON object.` });
        }
      }
    } catch (err) {
      if (err instanceof RunError) throw err;
      if (!(err instanceof ProviderError)) throw err;
      if (err.kind === 'refused' || err.kind === 'incomplete') throw new RunError(err.kind, err.message, undefined, model, usage);
      // Busy, slow or down: note it for staff, and try the next model the person allowed.
      await ctx.deps.db
        .insert(aiFailures)
        .values({ provider: model.provider, model: model.model, kind: err.kind })
        .catch(() => undefined);
      ctx.deps.log?.warn({ provider: model.provider, model: model.model, kind: err.kind, detail: err.message }, 'ai provider failed');
      if (err.kind === 'busy') coolingUntil.set(model.provider, Date.now() + (err.retryAfterSec ?? 20) * 1000);
      last = new RunError(err.kind, err.message, err.retryAfterSec, model, usage);
    }
  }
  throw last ?? new RunError('unavailable', 'No model is switched on.');
}
