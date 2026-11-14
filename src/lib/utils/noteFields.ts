/**
 * Note status and content type: fields that used to be stored as tags
 * ("Not answered", "Question/Answer", "Article", ...). Tags now only
 * describe topics.
 */

export const NOTE_STATUSES = ['answered', 'unanswered'] as const;
export type NoteStatus = (typeof NOTE_STATUSES)[number];

export const CONTENT_TYPES = ['question', 'article', 'trial', 'review', 'case', 'other'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const STATUS_LABELS: Record<NoteStatus, string> = {
  answered: 'Answered',
  unanswered: 'Unanswered',
};

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  question: 'Question',
  article: 'Article',
  trial: 'Trial',
  review: 'Review',
  case: 'Case',
  other: 'Other',
};

export function isNoteStatus(value: unknown): value is NoteStatus {
  return typeof value === 'string' && (NOTE_STATUSES as readonly string[]).includes(value);
}

export function isContentType(value: unknown): value is ContentType {
  return typeof value === 'string' && (CONTENT_TYPES as readonly string[]).includes(value);
}

/** Options for a content-type <Select>, with a leading "none" choice. */
export function contentTypeOptions(noneLabel: string) {
  return [
    { value: '', label: noneLabel },
    ...CONTENT_TYPES.map((value) => ({ value, label: CONTENT_TYPE_LABELS[value] })),
  ];
}

/** Key for a note's type in type filters: its content type, or 'none'. */
export type TypeFilterKey = ContentType | 'none';

export function typeFilterKey(contentType: ContentType | null | undefined): TypeFilterKey {
  return isContentType(contentType) ? contentType : 'none';
}

export function typeFilterLabel(key: TypeFilterKey): string {
  return key === 'none' ? 'No type' : CONTENT_TYPE_LABELS[key];
}

/**
 * Types present among `items` with their counts, in the usual type order
 * ("No type" last). Types with no notes are left out.
 */
export function typeCounts<T>(
  items: T[],
  typeOf: (item: T) => ContentType | null | undefined
): { key: TypeFilterKey; count: number }[] {
  const counts = new Map<TypeFilterKey, number>();
  for (const item of items) {
    const k = typeFilterKey(typeOf(item));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...CONTENT_TYPES, 'none' as const]
    .filter((k) => counts.has(k))
    .map((key) => ({ key, count: counts.get(key)! }));
}
