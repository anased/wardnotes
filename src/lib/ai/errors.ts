// src/lib/ai/errors.ts
// Provider-neutral AI errors.

/** The model (and any server-side fallback) declined the request. */
export class AiRefusalError extends Error {
  constructor(public category?: string | null) {
    super('The AI declined to process this request.');
    this.name = 'AiRefusalError';
  }
}

/** The response hit max_tokens and is incomplete. */
export class AiTruncatedError extends Error {
  constructor() {
    super('The AI response was cut off before it finished.');
    this.name = 'AiTruncatedError';
  }
}

/** The response wasn't valid JSON for the requested schema. */
export class AiValidationError extends Error {
  constructor(public detail: string) {
    super('The AI response could not be read.');
    this.name = 'AiValidationError';
  }
}

/** Non-2xx response from the OpenAI API. */
export class OpenAIApiError extends Error {
  constructor(public status: number | undefined, detail: string) {
    super(`OpenAI API error (${status ?? 'network'}): ${detail}`);
    this.name = 'OpenAIApiError';
  }
}
