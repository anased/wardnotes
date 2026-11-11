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
