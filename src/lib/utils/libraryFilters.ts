import { ContentType, NoteStatus, isContentType, isNoteStatus } from './noteFields';

/** Everything the Notes Library list can be narrowed by. */
export interface LibraryFilters {
  /** Full-text search. A search replaces the other filters. */
  q: string;
  /** Category name, or 'All'. */
  category: string;
  /** Notes must have all of these tags. */
  tags: string[];
  status: NoteStatus | '';
  contentType: ContentType | '';
}

export const EMPTY_FILTERS: LibraryFilters = {
  q: '',
  category: 'All',
  tags: [],
  status: '',
  contentType: '',
};

/** True when any filter other than search is set. */
export function hasFieldFilters(f: LibraryFilters): boolean {
  return f.category !== 'All' || f.tags.length > 0 || f.status !== '' || f.contentType !== '';
}

/**
 * Reads filters from a query string: ?q=&category=&tag=a&tag=b&status=&type=
 * Unknown status/type values are ignored.
 */
export function parseLibraryParams(search: string): LibraryFilters {
  const params = new URLSearchParams(search);
  const q = (params.get('q') || '').trim();
  if (q) return { ...EMPTY_FILTERS, q };

  const status = params.get('status');
  const type = params.get('type');
  const tags: string[] = [];
  for (const t of params.getAll('tag')) {
    const name = t.trim();
    if (name && !tags.some((x) => x.toLowerCase() === name.toLowerCase())) tags.push(name);
  }

  return {
    q: '',
    category: params.get('category')?.trim() || 'All',
    tags,
    status: isNoteStatus(status) ? status : '',
    contentType: isContentType(type) ? type : '',
  };
}

/** Builds the query string (without "?") for the given filters. */
export function buildLibraryQuery(f: LibraryFilters): string {
  const params = new URLSearchParams();
  if (f.q.trim()) {
    params.set('q', f.q.trim());
    return params.toString();
  }
  if (f.category !== 'All') params.set('category', f.category);
  f.tags.forEach((t) => params.append('tag', t));
  if (f.status) params.set('status', f.status);
  if (f.contentType) params.set('type', f.contentType);
  return params.toString();
}
