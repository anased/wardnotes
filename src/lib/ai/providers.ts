// src/lib/ai/providers.ts
// Provider abstraction for structured (JSON) generation. Server-side only.
//
// generateStructured() runs one call on the given provider/model and validates the
// output against a zod schema. It never throws for a bad *response* (refusal,
// truncation, invalid JSON, schema mismatch): it returns { ok: false } with the
// call's usage record, so the caller can retry/fall back and still log the tokens.
// Transport/API errors (auth, rate limit, network) are thrown.
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod/v4';
import { FALLBACK_BETA, claudeCallRecord, getClaude, supportsServerFallback } from './claude';
import { AiRefusalError, AiTruncatedError, AiValidationError, OpenAIApiError } from './errors';
import { estimateCostUsd, type AiTask, type ModelChoice } from './models';
import type { AiCallRecord } from './usage';

export interface StructuredRequest<T> {
  task: AiTask;
  choice: ModelChoice;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  /** Short identifier for the schema (OpenAI requires one). */
  schemaName: string;
  maxTokens?: number;
}

export type StructuredFailure = 'refusal' | 'truncated' | 'validation';

export type StructuredResult<T> =
  | { ok: true; data: T; record: AiCallRecord }
  | { ok: false; failure: StructuredFailure; error: Error; record: AiCallRecord };

/** Parse and validate model output text against the schema. */
export function validateJson<T>(schema: z.ZodType<T>, text: string): { ok: true; data: T } | { ok: false; error: AiValidationError } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: new AiValidationError(`invalid JSON: ${text.slice(0, 200)}`) };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    return { ok: false, error: new AiValidationError(issues) };
  }
  return { ok: true, data: parsed.data };
}

function finish<T>(
  record: Omit<AiCallRecord, 'success' | 'error'>,
  outcome: { ok: true; data: T } | { ok: false; failure: StructuredFailure; error: Error }
): StructuredResult<T> {
  if (outcome.ok) return { ok: true, data: outcome.data, record: { ...record, success: true } };
  return {
    ...outcome,
    record: {
      ...record,
      success: false,
      error: `${outcome.failure}: ${outcome.error instanceof AiValidationError ? outcome.error.detail : outcome.error.message}`.slice(0, 500),
    },
  };
}

// ---------------------------------------------------------------------------
// Anthropic

async function anthropicStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
  const { model, effort } = req.choice;
  // Passed to create() (not parse()) so a schema mismatch doesn't throw away the usage.
  const format = betaZodOutputFormat(req.schema as z.ZodType<T> & z.ZodObject);
  const message = await getClaude().beta.messages.create({
    model,
    max_tokens: req.maxTokens ?? 16000,
    ...(supportsServerFallback(model) ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
    output_config: {
      ...(effort ? { effort } : {}),
      format: { type: 'json_schema', schema: format.schema },
    },
    system: req.system,
    messages: [{ role: 'user', content: req.user }],
  });

  const { success: _s, error: _e, ...record } = claudeCallRecord(req.task, message);
  if (message.stop_reason === 'refusal') {
    return finish(record, { ok: false, failure: 'refusal', error: new AiRefusalError(message.stop_details?.category) });
  }
  if (message.stop_reason === 'max_tokens') {
    return finish(record, { ok: false, failure: 'truncated', error: new AiTruncatedError() });
  }
  const text = message.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  const validated = validateJson(req.schema, text);
  return finish(record, validated.ok ? validated : { ok: false, failure: 'validation', error: validated.error });
}

// ---------------------------------------------------------------------------
// OpenAI (Chat Completions with strict JSON-schema output). No SDK dependency.

interface OpenAIChatResponse {
  model: string;
  choices: { finish_reason: string; message: { content: string | null; refusal?: string | null } }[];
  usage?: { prompt_tokens: number; completion_tokens: number; prompt_tokens_details?: { cached_tokens?: number } };
}

const OPENAI_MAX_ATTEMPTS = 3;

async function openaiFetch(body: unknown): Promise<OpenAIChatResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new OpenAIApiError(401, 'OPENAI_API_KEY is not set');
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      if (attempt >= OPENAI_MAX_ATTEMPTS) throw new OpenAIApiError(undefined, String(err));
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      continue;
    }
    if (res.ok) return (await res.json()) as OpenAIChatResponse;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= OPENAI_MAX_ATTEMPTS) {
      throw new OpenAIApiError(res.status, (await res.text()).slice(0, 300));
    }
    const retryAfter = Number(res.headers.get('retry-after'));
    await new Promise((r) => setTimeout(r, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt));
  }
}

async function openaiStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(req.schema) as Record<string, unknown>;
  const json = await openaiFetch({
    model: req.choice.model,
    max_completion_tokens: req.maxTokens ?? 16000,
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.user },
    ],
    response_format: { type: 'json_schema', json_schema: { name: req.schemaName, strict: true, schema } },
  });

  const cached = json.usage?.prompt_tokens_details?.cached_tokens ?? 0;
  const prompt = json.usage?.prompt_tokens ?? 0;
  const output = json.usage?.completion_tokens ?? 0;
  const model = json.model || req.choice.model;
  const record = {
    task: req.task,
    provider: 'openai' as const,
    model,
    inputTokens: prompt - cached,
    outputTokens: output,
    totalInputTokens: prompt,
    costUsd: estimateCostUsd(model, { inputTokens: prompt - cached, outputTokens: output, cacheReadTokens: cached }),
  };

  const choice = json.choices[0];
  if (!choice || choice.message.refusal) {
    return finish(record, { ok: false, failure: 'refusal', error: new AiRefusalError(null) });
  }
  if (choice.finish_reason === 'length') {
    return finish(record, { ok: false, failure: 'truncated', error: new AiTruncatedError() });
  }
  const validated = validateJson(req.schema, choice.message.content ?? '');
  return finish(record, validated.ok ? validated : { ok: false, failure: 'validation', error: validated.error });
}

// ---------------------------------------------------------------------------

export function generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
  switch (req.choice.provider) {
    case 'anthropic':
      return anthropicStructured(req);
    case 'openai':
      return openaiStructured(req);
  }
}
