/** Pure helpers for trial records. */
import { topicKey } from './topicTree';

export interface TrialLike {
  id: string;
  acronym: string;
  full_name: string | null;
  year: number | null;
  superseded_by: string | null;
}

/** "POINT (2018)" */
export function trialLabel(t: Pick<TrialLike, 'acronym' | 'year'>): string {
  return t.year ? `${t.acronym} (${t.year})` : t.acronym;
}

/**
 * Matches trials by acronym or full name, ignoring case: exact acronym first,
 * then acronym prefix, then anything containing the text.
 */
export function matchTrials<T extends TrialLike>(trials: T[], query: string, limit = 20): T[] {
  const q = topicKey(query);
  if (!q) return trials.slice(0, limit);
  const rank = (t: T) => {
    const a = topicKey(t.acronym);
    const f = topicKey(t.full_name ?? '');
    if (a === q) return 0;
    if (a.startsWith(q)) return 1;
    if (a.includes(q)) return 2;
    if (f.includes(q)) return 3;
    return null;
  };
  return trials
    .map((t) => ({ t, r: rank(t) }))
    .filter((x): x is { t: T; r: number } => x.r !== null)
    .sort((a, b) => a.r - b.r || a.t.acronym.localeCompare(b.t.acronym, undefined, { sensitivity: 'base' }))
    .slice(0, limit)
    .map((x) => x.t);
}

/** An existing trial with the same acronym and year (the database's uniqueness rule). */
export function findDuplicateTrial<T extends TrialLike>(
  trials: T[],
  acronym: string,
  year: number | null,
  excludeId?: string
): T | undefined {
  const k = topicKey(acronym);
  if (!k) return undefined;
  return trials.find((t) => t.id !== excludeId && topicKey(t.acronym) === k && (t.year ?? null) === (year ?? null));
}

/**
 * Trials that may be chosen as "superseded by" for `trialId`: not itself and
 * not one that is (directly or through a chain) superseded by it, which would
 * make a loop.
 */
export function supersedeCandidates<T extends TrialLike>(trials: T[], trialId: string | undefined): T[] {
  if (!trialId) return trials;
  const byId = new Map(trials.map((t) => [t.id, t]));
  const leadsTo = (startId: string) => {
    const seen = new Set<string>();
    let cur: string | null = startId;
    while (cur && !seen.has(cur)) {
      if (cur === trialId) return true;
      seen.add(cur);
      cur = byId.get(cur)?.superseded_by ?? null;
    }
    return false;
  };
  return trials.filter((t) => t.id !== trialId && !leadsTo(t.superseded_by ?? ''));
}

/** Trials that list `trialId` as their replacement. */
export function supersededTrials<T extends TrialLike>(trials: T[], trialId: string): T[] {
  return trials.filter((t) => t.superseded_by === trialId);
}

/** Parses a year field: blank -> null, otherwise a whole number in range or NaN. */
export function parseTrialYear(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1900 && n <= 2100 ? n : NaN;
}
