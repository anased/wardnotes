// src/lib/ai/usage.ts
// One record per AI API call, for cost/usage logging (api_usage_logs).
import type { AiProvider, AiTask } from './models';

export interface AiCallRecord {
  task: AiTask;
  provider: AiProvider;
  /** Model that served the call (may differ from the requested one after a refusal fallback). */
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Input tokens including cache reads/writes. */
  totalInputTokens: number;
  costUsd: number;
  success: boolean;
  /** Why the call's output wasn't usable, if it wasn't. */
  error?: string;
}

export function totalTokens(record: AiCallRecord): number {
  return record.totalInputTokens + record.outputTokens;
}

/** Sum of estimated costs, rounded to api_usage_logs precision. */
export function totalCostUsd(records: AiCallRecord[]): number {
  return Number(records.reduce((sum, r) => sum + r.costUsd, 0).toFixed(6));
}
