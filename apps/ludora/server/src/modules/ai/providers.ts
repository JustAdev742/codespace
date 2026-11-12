import Anthropic from '@anthropic-ai/sdk';
import type { AiModelOption } from '@ludora/shared';
import type { AiProviderConfig, Config } from '../../config.ts';

/*
 * The AI providers. Any number of services that speak the OpenAI
 * chat-completions API (Groq, OpenRouter, Cerebras, Mistral and others), plus
 * Anthropic through its own SDK. They are configured only by the server's
 * environment; keys stay in this module's closures and are never logged,
 * returned or sent anywhere but the provider's own address.
 */

/** Why a provider gave no usable answer. */
export type ProviderFailure =
  /** Rate limited (429) or overloaded: try another model, or wait. */
  | 'busy'
  /** Took longer than AI_TIMEOUT_SEC. */
  | 'timeout'
  /** Down, unreachable, or set up wrongly (bad key, unknown model). */
  | 'unavailable'
  /** The model declined, or the provider's own filter stopped it. */
  | 'refused'
  /** The answer was cut off. */
  | 'incomplete';

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderFailure,
    message: string = kind,
    /** Seconds the provider asked us to wait (a 429's retry-after). */
    readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  /** The JSON schema of the answer, for providers that can hold the model to one. */
  jsonSchema?: Record<string, unknown>;
}

export interface Completion {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
}

/** One model on one provider. */
export interface AiModel extends AiModelOption {
  /** The model's id at its provider. */
  model: string;
  complete(req: CompletionRequest): Promise<Completion>;
}

export interface AiProviderInfo {
  name: string;
  kind: 'openai' | 'anthropic';
  /** The provider's host, for staff. Never the key. */
  host: string;
  models: AiModel[];
}

/* ------------------------------ OpenAI-compatible ------------------------------ */

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'provider';

/** Seconds from a retry-after header: a number of seconds or an HTTP date. */
export function retryAfterSeconds(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0) return Math.ceil(n);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, Math.ceil((at - now) / 1000)) : undefined;
}

type FetchLike = typeof fetch;

interface ChatResponse {
  choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export function openAiCompatible(cfg: AiProviderConfig, opts: { timeoutMs: number; fetch?: FetchLike }): AiProviderInfo {
  const doFetch = opts.fetch ?? fetch;
  const base = cfg.baseUrl.replace(/\/+$/, '');
  const providerSlug = slug(cfg.name);
  // A provider that rejected response_format once is asked without it from then on.
  let jsonMode = cfg.jsonMode;

  const call = async (model: string, req: CompletionRequest): Promise<Completion> => {
    const body = (withJson: boolean) =>
      JSON.stringify({
        model,
        messages: [{ role: 'system', content: req.system }, ...req.messages],
        max_tokens: req.maxTokens,
        temperature: 0.4,
        ...(withJson ? { response_format: { type: 'json_object' } } : {}),
      });
    const send = async (withJson: boolean): Promise<Response> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
      try {
        return await doFetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) },
          body: body(withJson),
          signal: controller.signal,
        });
      } catch (err) {
        if (controller.signal.aborted) throw new ProviderError('timeout', `${cfg.name} took longer than ${opts.timeoutMs} ms`);
        throw new ProviderError('unavailable', `${cfg.name} could not be reached (${(err as Error).name})`);
      } finally {
        clearTimeout(timer);
      }
    };
    let res = await send(jsonMode);
    if (res.status === 400 && jsonMode) {
      // Some models have no JSON mode and say so with a 400. Ask again without it; the prompt asks for JSON anyway.
      const detail = await res.text().catch(() => '');
      if (/response_format|json/i.test(detail)) {
        jsonMode = false;
        res = await send(false);
      } else throw new ProviderError('unavailable', `${cfg.name} answered 400`);
    }
    if (res.status === 429) throw new ProviderError('busy', `${cfg.name} answered 429`, retryAfterSeconds(res.headers.get('retry-after')));
    if (res.status >= 500) throw new ProviderError(res.status === 503 || res.status === 529 ? 'busy' : 'unavailable', `${cfg.name} answered ${res.status}`, retryAfterSeconds(res.headers.get('retry-after')));
    if (!res.ok) throw new ProviderError('unavailable', `${cfg.name} answered ${res.status}`);
    let data: ChatResponse;
    try {
      data = (await res.json()) as ChatResponse;
    } catch {
      throw new ProviderError('unavailable', `${cfg.name} sent a reply that was not JSON`);
    }
    const choice = data.choices?.[0];
    const usage = { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 };
    if (choice?.finish_reason === 'content_filter') throw new ProviderError('refused', `${cfg.name} filtered the answer`);
    if (choice?.finish_reason === 'length') throw new ProviderError('incomplete', `${cfg.name} cut the answer off`);
    const text = choice?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new ProviderError('unavailable', `${cfg.name} sent an empty answer`);
    return { text, usage };
  };

  return {
    name: cfg.name,
    kind: 'openai',
    host: new URL(base).host,
    models: cfg.models.map((m) => {
      const id = typeof m === 'string' ? m : m.id;
      const label = typeof m === 'string' ? m : (m.label ?? m.id);
      return { id: `${providerSlug}/${id}`, label, provider: cfg.name, model: id, complete: (req: CompletionRequest) => call(id, req) };
    }),
  };
}

/* ---------------------------------- Anthropic ---------------------------------- */

/** Models that take the server-side fallback for policy declines (`fallbacks: "default"`). */
const takesDefaultFallback = (model: string) => /^claude-(opus-5|fable-5|sonnet-5-5)/.test(model);

/** Maps an SDK failure to a provider failure; anything unexpected is rethrown. */
export function fromAnthropicError(err: unknown): unknown {
  if (err instanceof ProviderError) return err;
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new ProviderError('timeout', err.message);
  if (err instanceof Anthropic.APIConnectionError) return new ProviderError('unavailable', err.message);
  // 429 and 5xx (including 529, overloaded) pass with time; 4xx means the key or model is set up wrongly.
  if (err instanceof Anthropic.RateLimitError) return new ProviderError('busy', err.message, retryAfterSeconds(err.headers?.get('retry-after') ?? null));
  if (err instanceof Anthropic.InternalServerError) return new ProviderError('busy', err.message);
  if (err instanceof Anthropic.APIError) return new ProviderError('unavailable', `${err.status ?? ''} ${err.message}`.trim());
  return err;
}

/** The parts of the SDK client used here, so tests can stand in for the API. */
export type MessagesClient = Pick<Anthropic, 'beta'>;

export function anthropicProvider({ apiKey, model, timeoutMs }: { apiKey: string; model: string; timeoutMs: number }, client: MessagesClient = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 1 })): AiProviderInfo {
  const complete = async (req: CompletionRequest): Promise<Completion> => {
    let res: Anthropic.Beta.BetaMessage;
    try {
      res = await client.beta.messages.create({
        model,
        // Room for fifteen questions with explanations, and for thinking.
        max_tokens: Math.max(req.maxTokens, 16_000),
        system: req.system,
        messages: req.messages,
        output_config: { effort: 'medium', ...(req.jsonSchema ? { format: { type: 'json_schema' as const, schema: req.jsonSchema } } : {}) },
        ...(takesDefaultFallback(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      });
    } catch (err) {
      throw fromAnthropicError(err);
    }
    if (res.stop_reason === 'refusal') throw new ProviderError('refused', 'The model declined the request.');
    if (res.stop_reason === 'max_tokens') throw new ProviderError('incomplete', 'The answer was cut off.');
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    return { text, usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens } };
  };
  return { name: 'Anthropic', kind: 'anthropic', host: 'api.anthropic.com', models: [{ id: `anthropic/${model}`, label: model, provider: 'Anthropic', model, complete }] };
}

/* --------------------------------- From config --------------------------------- */

/** Every provider the environment configures, in order: AI_PROVIDERS first, then Anthropic. */
export function providersFromConfig(config: Pick<Config, 'AI_PROVIDERS' | 'ANTHROPIC_API_KEY' | 'ANTHROPIC_MODEL' | 'AI_TIMEOUT_SEC'>): AiProviderInfo[] {
  const timeoutMs = config.AI_TIMEOUT_SEC * 1000;
  const list = config.AI_PROVIDERS.map((p) => openAiCompatible(p, { timeoutMs }));
  if (config.ANTHROPIC_API_KEY) list.push(anthropicProvider({ apiKey: config.ANTHROPIC_API_KEY, model: config.ANTHROPIC_MODEL, timeoutMs: Math.max(timeoutMs, 90_000) }));
  // Two providers with the same name would share ids; the later one is left out.
  const seen = new Set<string>();
  return list.filter((p) => {
    const ids = p.models.map((m) => m.id);
    if (ids.some((id) => seen.has(id))) return false;
    for (const id of ids) seen.add(id);
    return true;
  });
}

/* ------------------------------ Reading the answer ------------------------------ */

/**
 * The JSON object in a model's answer. Models without a JSON mode wrap it in
 * prose, code fences or a <think> block; this finds the object and parses it.
 * Throws a SyntaxError with a short reason when there is none.
 */
export function extractJson(text: string): unknown {
  const stripped = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  try {
    return JSON.parse(stripped);
  } catch {
    /* look for the object inside */
  }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(stripped)?.[1];
  if (fenced) {
    try {
      return JSON.parse(fenced.trim());
    } catch {
      /* fall through */
    }
  }
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(stripped.slice(start, end + 1));
  throw new SyntaxError('The answer held no JSON object.');
}
