// src/lib/ai/claude.ts
// Shared Claude API client and helpers for all server-side AI features.
// Model choice lives in ./models.ts.
import Anthropic from '@anthropic-ai/sdk';
import { estimateCostUsd, type AiTask } from './models';
import { AiRefusalError, AiTruncatedError, AiValidationError, OpenAIApiError } from './errors';
import type { AiCallRecord } from './usage';

export { AiRefusalError as ClaudeRefusalError, AiTruncatedError as ClaudeTruncatedError } from './errors';

// Server-side refusal fallback: if the safety classifiers decline a request
// (medical content can occasionally trip the `bio` category), the API re-runs
// it on a server-chosen fallback model inside the same call. Supported on
// Opus-class models, not on Claude Haiku 5.5.
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01' as const;

let client: Anthropic | null = null;

/** Lazily constructed so builds don't need ANTHROPIC_API_KEY at import time. */
export function getClaude(): Anthropic {
  if (!client) {
    client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
  }
  return client;
}

/** Whether a model accepts the server-side refusal `fallbacks` parameter. */
export function supportsServerFallback(model: string): boolean {
  return !model.startsWith('claude-haiku');
}

type AnyMessage = Anthropic.Message | Anthropic.Beta.BetaMessage;

/** Throws on refusal / truncation; call before reading content. */
export function assertCompleted(message: AnyMessage): void {
  if (message.stop_reason === 'refusal') {
    throw new AiRefusalError(message.stop_details?.category);
  }
  if (message.stop_reason === 'max_tokens') {
    throw new AiTruncatedError();
  }
}

/** Concatenate all text blocks in a response. */
export function extractText(message: AnyMessage): string {
  return message.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim();
}

function completionOutcome(message: AnyMessage): { success: boolean; error?: string } {
  if (message.stop_reason === 'refusal') return { success: false, error: 'refusal' };
  if (message.stop_reason === 'max_tokens') return { success: false, error: 'truncated' };
  return { success: true };
}

/** Usage/cost record for one Claude response (for api_usage_logs). */
export function claudeCallRecord(
  task: AiTask,
  message: AnyMessage,
  outcome: { success: boolean; error?: string } = completionOutcome(message)
): AiCallRecord {
  const { usage } = message;
  const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
  return {
    task,
    provider: 'anthropic',
    model: message.model,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalInputTokens: usage.input_tokens + cacheWriteTokens + cacheReadTokens,
    costUsd: estimateCostUsd(message.model, {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheWriteTokens,
      cacheReadTokens,
    }),
    ...outcome,
  };
}

export function claudeCallRecords(task: AiTask, ...messages: AnyMessage[]): AiCallRecord[] {
  return messages.map((m) => claudeCallRecord(task, m));
}

/** Map AI errors to an HTTP status and a user-safe message for API routes. */
export function toHttpError(error: unknown): { status: number; message: string } {
  if (error instanceof AiRefusalError) {
    return { status: 422, message: error.message };
  }
  if (error instanceof AiTruncatedError || error instanceof AiValidationError) {
    return { status: 502, message: error.message };
  }
  if (error instanceof OpenAIApiError) {
    if (error.status === 429) return { status: 503, message: 'The AI service is busy. Please try again in a moment.' };
    if (error.status === 401) {
      console.error('OpenAI authentication failed - check OPENAI_API_KEY');
      return { status: 500, message: 'AI service is not configured correctly.' };
    }
    return { status: 502, message: `AI service error (${error.status ?? 'unknown'}).` };
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
