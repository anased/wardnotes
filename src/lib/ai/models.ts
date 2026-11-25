// src/lib/ai/models.ts
// Single source of truth for which model runs each AI task, and what models cost.
// Every AI call reads its model from here; no other file names a model.
//
// Env overrides (per task, upper-snake-case of the task name, e.g. TRIAL_EXTRACTION):
//   AI_MODEL_<TASK>              model id for the task
//   AI_PROVIDER_<TASK>           'anthropic' | 'openai' (only tasks in PROVIDER_SWITCHABLE)
//   AI_FALLBACK_MODEL_<TASK>     model used after the primary fails validation twice
//   AI_FALLBACK_PROVIDER_<TASK>  provider of the fallback model
//   AI_MODEL_PRICES              JSON, extra/overridden prices in USD per million tokens,
//                                e.g. {"gpt-5-mini":{"input":0.25,"output":2}}

export type AiProvider = 'anthropic' | 'openai';
export type AiEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type AiTask =
  | 'trialExtraction'
  | 'flashcardGeneration'
  | 'clinicalQuestion'
  | 'noteImprovement'
  | 'articlePrimer';

export interface ModelChoice {
  provider: AiProvider;
  model: string;
  /** Anthropic `output_config.effort`; ignored by other providers. */
  effort?: AiEffort;
}

export interface TaskModelConfig extends ModelChoice {
  /** Stronger model used when the primary model's output fails validation. */
  fallback?: ModelChoice;
}

export const MODELS = {
  opus: 'claude-opus-5-5',
  haiku: 'claude-haiku-5-5',
} as const;

const DEFAULTS: Record<AiTask, TaskModelConfig> = {
  // Reading comprehension over one abstract: the cheap model is enough, with the
  // current model as a safety net if its output doesn't validate.
  trialExtraction: {
    provider: 'anthropic',
    model: MODELS.haiku,
    effort: 'low',
    fallback: { provider: 'anthropic', model: MODELS.opus, effort: 'low' },
  },
  flashcardGeneration: { provider: 'anthropic', model: MODELS.opus },
  clinicalQuestion: { provider: 'anthropic', model: MODELS.opus, effort: 'high' },
  noteImprovement: { provider: 'anthropic', model: MODELS.opus, effort: 'low' },
  // Deep Read primer: a short read of one abstract, like trial extraction.
  articlePrimer: {
    provider: 'anthropic',
    model: MODELS.haiku,
    effort: 'low',
    fallback: { provider: 'anthropic', model: MODELS.opus, effort: 'low' },
  },
};

/**
 * Tasks whose calls go through the provider abstraction (lib/ai/providers) and can
 * therefore run on any provider. The others use Anthropic-specific request features
 * (server-side refusal fallback, multi-step pipelines) and stay on Anthropic.
 */
const PROVIDER_SWITCHABLE: ReadonlySet<AiTask> = new Set<AiTask>(['trialExtraction', 'articlePrimer']);

const PROVIDERS: readonly AiProvider[] = ['anthropic', 'openai'];

function envKey(task: AiTask): string {
  return task.replace(/([A-Z])/g, '_$1').toUpperCase();
}

function readProvider(name: string, fallback: AiProvider): AiProvider {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (!(PROVIDERS as readonly string[]).includes(raw)) {
    throw new Error(`${name} must be one of ${PROVIDERS.join(', ')} (got "${raw}")`);
  }
  return raw as AiProvider;
}

function resolveChoice(base: ModelChoice, prefix: 'AI' | 'AI_FALLBACK', key: string): ModelChoice {
  const providerVar = `${prefix}_PROVIDER_${key}`;
  const modelVar = `${prefix}_MODEL_${key}`;
  const provider = readProvider(providerVar, base.provider);
  const model = process.env[modelVar]?.trim();
  if (provider !== base.provider && !model) {
    throw new Error(`${providerVar}=${provider} also needs ${modelVar} to name a ${provider} model`);
  }
  return { ...base, provider, model: model || base.model };
}

/** The model (and fallback) configured for a task, with env overrides applied. */
export function getTaskModel(task: AiTask): TaskModelConfig {
  const base = DEFAULTS[task];
  const key = envKey(task);
  const primary = resolveChoice(base, 'AI', key);
  const fallback = base.fallback ? resolveChoice(base.fallback, 'AI_FALLBACK', key) : undefined;

  if (!PROVIDER_SWITCHABLE.has(task)) {
    for (const choice of [primary, fallback]) {
      if (choice && choice.provider !== 'anthropic') {
        throw new Error(`AI task "${task}" only supports the anthropic provider`);
      }
    }
  }
  return { ...primary, fallback };
}

// ---------------------------------------------------------------------------
// Pricing (USD per million tokens), used to estimate the cost of each call.

export interface ModelPrice {
  input: number;
  output: number;
  cacheWrite?: number;
  cacheRead?: number;
}

const PRICES: Record<string, ModelPrice> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 },
  // Prompts up to 100K tokens; trial abstracts are far below that.
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
  // Possible server-side refusal-fallback targets of Opus 5.5.
  'claude-opus-5': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
};

let envPrices: Record<string, ModelPrice> | null = null;

function priceOverrides(): Record<string, ModelPrice> {
  if (envPrices) return envPrices;
  envPrices = {};
  const raw = process.env.AI_MODEL_PRICES;
  if (raw) {
    try {
      envPrices = JSON.parse(raw) as Record<string, ModelPrice>;
    } catch {
      console.error('AI_MODEL_PRICES is not valid JSON; ignoring it');
    }
  }
  return envPrices;
}

/** Price of a model, or null if unknown (cost is then logged as 0). */
export function getModelPrice(model: string): ModelPrice | null {
  return priceOverrides()[model] ?? PRICES[model] ?? null;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
}

/** Estimated cost in USD of one call, rounded to 6 decimals (api_usage_logs precision). */
export function estimateCostUsd(model: string, usage: TokenUsage): number {
  const price = getModelPrice(model);
  if (!price) return 0;
  const cost =
    usage.inputTokens * price.input +
    usage.outputTokens * price.output +
    (usage.cacheWriteTokens ?? 0) * (price.cacheWrite ?? price.input) +
    (usage.cacheReadTokens ?? 0) * (price.cacheRead ?? price.input);
  return Number((cost / 1_000_000).toFixed(6));
}
