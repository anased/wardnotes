// src/lib/ai/claude.ts
// Shared Claude API client and helpers for all server-side AI features.
import Anthropic from '@anthropic-ai/sdk';

export const CLAUDE_MODEL = 'claude-opus-5-5';

// Server-side refusal fallback: if the safety classifiers decline a request
// (medical content can occasionally trip the `bio` category), the API re-runs
// it on a server-chosen fallback model inside the same call.
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01' as const;

// Claude Opus 5.5 list prices (USD per token).
const PRICE_INPUT = 4 / 1_000_000;
const PRICE_OUTPUT = 20 / 1_000_000;
const PRICE_CACHE_WRITE = PRICE_INPUT * 1.25;
const PRICE_CACHE_READ = 0.2 / 1_000_000;

let client: Anthropic | null = null;

/** Lazily constructed so builds don't need ANTHROPIC_API_KEY at import time. */
export function getClaude(): Anthropic {
  if (!client) {
    client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
  }
  return client;
}

/** Thrown when Claude (and any fallback model) declines the request. */
export class ClaudeRefusalError extends Error {
  constructor(public category: string | null | undefined) {
    super('The AI declined to process this request.');
    this.name = 'ClaudeRefusalError';
  }
}

/** Thrown when the response hit max_tokens and is incomplete. */
export class ClaudeTruncatedError extends Error {
  constructor() {
    super('The AI response was cut off before it finished.');
    this.name = 'ClaudeTruncatedError';
  }
}

type AnyMessage = Anthropic.Message | Anthropic.Beta.BetaMessage;

/** Throws on refusal / truncation; call before reading content. */
export function assertCompleted(message: AnyMessage): void {
  if (message.stop_reason === 'refusal') {
    throw new ClaudeRefusalError(message.stop_details?.category);
  }
  if (message.stop_reason === 'max_tokens') {
    throw new ClaudeTruncatedError();
  }
}

/** Concatenate all text blocks in a response. */
export function extractText(message: AnyMessage): string {
  return message.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim();
}

export interface UsageSummary {
  tokens: number;
  costUsd: number;
}

/** Token count and approximate cost of one or more responses (for api_usage_logs). */
export function summarizeUsage(...messages: AnyMessage[]): UsageSummary {
  let tokens = 0;
  let costUsd = 0;
  for (const { usage } of messages) {
    const cacheWrite = usage.cache_creation_input_tokens ?? 0;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    tokens += usage.input_tokens + cacheWrite + cacheRead + usage.output_tokens;
    costUsd +=
      usage.input_tokens * PRICE_INPUT +
      cacheWrite * PRICE_CACHE_WRITE +
      cacheRead * PRICE_CACHE_READ +
      usage.output_tokens * PRICE_OUTPUT;
  }
  return { tokens, costUsd: Number(costUsd.toFixed(6)) };
}

/** Map Claude errors to an HTTP status and a user-safe message for API routes. */
export function toHttpError(error: unknown): { status: number; message: string } {
  if (error instanceof ClaudeRefusalError) {
    return { status: 422, message: error.message };
  }
  if (error instanceof ClaudeTruncatedError) {
    return { status: 502, message: error.message };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { status: 503, message: 'The AI service is busy. Please try again in a moment.' };
  }
  if (error instanceof Anthropic.AuthenticationError) {
    console.error('Anthropic authentication failed - check ANTHROPIC_API_KEY');
    return { status: 500, message: 'AI service is not configured correctly.' };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { status: 503, message: 'Could not reach the AI service. Please try again.' };
  }
  if (error instanceof Anthropic.APIError) {
    return { status: 502, message: `AI service error (${error.status ?? 'unknown'}).` };
  }
  return {
    status: 500,
    message: error instanceof Error ? error.message : String(error),
  };
}
