// src/lib/articles/grounding.ts
// Trust safeguard: every number the AI writes must appear in the source text.
// Deterministic (no AI). Pure; client-safe.
//
// Numbers are compared by value, so "5.0%" matches "5%", "1,000" matches "1000",
// and the Lancet's mid-dot decimals ("0·75") match "0.75". A range like
// "0.59–0.95" is two numbers. Signs are ignored ("−1.2" and "1.2" are the same).

/** Digit groups separated by commas or thin/non-breaking spaces, decimals, or plain integers. */
const NUMBER_RE = /\d{1,3}(?:[,   ]\d{3})+(?![\d])(?:\.\d+)?|\d*\.\d+|\d+/g;

function normalize(text: string): string {
  // Mid-dot or one-dot-leader used as a decimal point between digits.
  return text.replace(/(\d)[·․](\d)/g, '$1.$2');
}

export interface FoundNumber {
  /** The number as written (after normalization). */
  raw: string;
  value: number;
}

export function extractNumbers(text: string): FoundNumber[] {
  const found: FoundNumber[] = [];
  for (const m of normalize(text).matchAll(NUMBER_RE)) {
    const raw = m[0];
    const value = Number(raw.replace(/[,   ]/g, ''));
    if (Number.isFinite(value)) found.push({ raw, value });
  }
  return found;
}

/** Turns a value into a stable key, so 5 and 5.0 (and float noise) compare equal. */
const key = (value: number) => value.toFixed(6);

export function sourceNumberSet(source: string): Set<string> {
  return new Set(extractNumbers(source).map((n) => key(n.value)));
}

/** The numbers in `text` that don't appear anywhere in the source, as written. */
export function ungroundedNumbers(text: string, source: string | Set<string>): string[] {
  const allowed = typeof source === 'string' ? sourceNumberSet(source) : source;
  return extractNumbers(text)
    .filter((n) => !allowed.has(key(n.value)))
    .map((n) => n.raw);
}

/**
 * Split into sentences. A break needs sentence-ending punctuation, whitespace, and
 * then a capital letter or an opening bracket, so "vs. 6.5%" and "0.59" don't split.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z(\["“])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Removes every sentence holding a number that isn't in the source. */
export function dropUngroundedSentences(
  text: string,
  source: string | Set<string>
): { text: string; dropped: number } {
  const allowed = typeof source === 'string' ? sourceNumberSet(source) : source;
  const sentences = splitSentences(text);
  const kept = sentences.filter((s) => ungroundedNumbers(s, allowed).length === 0);
  return { text: kept.join(' '), dropped: sentences.length - kept.length };
}
