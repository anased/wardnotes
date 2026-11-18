// Pure helpers for the dashboard's summary cards.

/** Seconds a typical card takes to review; used for the "≈ N min" estimate. */
const SECONDS_PER_CARD = 25;

/** "Good morning" / "Good afternoon" / "Good evening" for the given time. */
export function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** First word of a display name, or '' when there is none. */
export function firstName(fullName: string | null | undefined): string {
  return (fullName ?? '').trim().split(/\s+/)[0] ?? '';
}

/** Minutes a review of `cards` cards is likely to take (at least 1 when there are any). */
export function reviewMinutes(cards: number): number {
  if (cards <= 0) return 0;
  return Math.max(1, Math.round((cards * SECONDS_PER_CARD) / 60));
}

/** YYYY-MM-DD in UTC, the format daily_activity.date is read and written in. */
export function dateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

/** Monday 00:00 (UTC) of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d;
}

export interface WeekDay {
  /** One-letter weekday label, M…S. */
  label: string;
  /** Full weekday name, for screen readers. */
  name: string;
  date: string;
  active: boolean;
  isFuture: boolean;
  isToday: boolean;
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Monday–Sunday of the current week, each marked active when it has activity.
 * `activeDates` are YYYY-MM-DD keys of days with at least one note.
 */
export function buildWeek(now: Date, activeDates: Iterable<string>): WeekDay[] {
  const active = new Set(activeDates);
  const monday = startOfWeek(now);
  const today = dateKey(now);
  return DAY_LABELS.map((label, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    const key = dateKey(d);
    return {
      label,
      name: DAY_NAMES[i],
      date: key,
      active: active.has(key),
      isFuture: key > today,
      isToday: key === today,
    };
  });
}

/** Number of items created on or after Monday of the current week. */
export function countThisWeek(items: { created_at: string }[], now: Date): number {
  const from = startOfWeek(now).getTime();
  return items.filter((n) => new Date(n.created_at).getTime() >= from).length;
}

/** Plain-text preview of a note body, collapsed to one line and cut at `max` characters. */
export function previewText(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}
