#!/usr/bin/env node
/**
 * Phase out the "Trial" note type: each note typed Trial is linked to a
 * shared trial record ("cites"), the trial is linked to the note's topics,
 * and the note gets another type (Review by default). Never connects to the
 * database: it reads and writes files, and prints SQL for you to review and
 * run. Run it after the tag migration, so notes already have their topics.
 *
 *   1. Inventory (read-only): run scripts/trial-notes/inventory.sql and save
 *      the JSON cell as scripts/trial-notes/out/inventory.json.
 *
 *   2. Export a draft:
 *        node scripts/trial-notes/trial-notes.mjs export inventory.json [--out DIR]
 *      Writes DIR/trial-notes.csv and .json (DIR defaults to
 *      scripts/trial-notes/out): one row per note, with an acronym and year
 *      parsed from the title ("Aristotle (2011) Trial - …" → ARISTOTLE 2011).
 *      When the title doesn't name one trial clearly the acronym is left
 *      blank, action is skip and review=yes.
 *
 *   3. Edit the CSV and check it:
 *        node scripts/trial-notes/trial-notes.mjs check trial-notes.csv
 *      A note that covers several trials gets one row per trial (same
 *      note_id and new_type).
 *
 *   4. Generate the apply SQL (dry run: ends with ROLLBACK and a report):
 *        node scripts/trial-notes/trial-notes.mjs apply trial-notes.csv > apply.sql
 *      Run it, read the report, then regenerate with --commit to apply.
 *
 * Columns
 *   action    create_or_link | skip
 *   note_id   the note (keep as exported)
 *   acronym   trial acronym, e.g. ARISTOTLE (required for create_or_link)
 *   year      publication year, or blank
 *   new_type  the note's new type: question | article | review | case | other
 *   user_id   owner of the note (keep as exported)
 *   title, topics, review, reason: information only.
 *
 * What apply does (safe to re-run; never deletes anything):
 *   - reuses the user's trial with the same acronym (ignoring case) and year,
 *     or the only trial with that acronym when the row has no year; else
 *     creates it
 *   - links the note to the trial with "cites" (once)
 *   - links the trial to each of the note's topics, in the note's section
 *   - sets the note's type to new_type, only while it is still Trial (so
 *     edits made in the app after the first run are kept)
 *   - takes a snapshot (backup.*_pre_trialnotes) on the first committed run;
 *     scripts/trial-notes/rollback.sql undoes what was added since
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { key, norm, parseCsv, sqlText, toCsv } from '../tag-migration/tag-migration.mjs';

export const ACTIONS = ['create_or_link', 'skip'];
/** Types a trial note can become (not 'trial', which is being phased out). */
export const NEW_TYPES = ['question', 'article', 'review', 'case', 'other'];
export const DEFAULT_NEW_TYPE = 'review';

export const COLUMNS = ['action', 'note_id', 'title', 'acronym', 'year', 'new_type', 'review', 'reason', 'topics', 'user_id'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YEAR_MIN = 1900;
const YEAR_MAX = 2100;

/** Words that start a title but aren't a trial name ("The extended window trials"). */
const NOT_ACRONYMS = new Set([
  'the', 'a', 'an', 'acute', 'chronic', 'management', 'review', 'trial', 'trials', 'study', 'studies',
  'large', 'small', 'non', 'new', 'old', 'stroke', 'summary', 'overview',
]);

/** Upper-case words in a title that look like trial names (DAWN, DEFUSE-3). */
function capsWords(title) {
  return (title.match(/\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*\b/g) ?? []).filter((w) => w.length >= 3);
}

/**
 * Suggests { acronym, year, sure, reason } for a note title.
 *   "Aristotle (2011) Trial - Apixaban vs Warfarin" → ARISTOTLE, 2011, sure
 *   "Averroes - Apixaban vs Aspirin"              → AVERROES, no year, not sure
 *   "CREST 2 trial"                                → CREST 2
 *   "DIFFUSE and DAWN"                             → blank (two trials)
 *   "The extended window trials"                   → blank
 */
export function parseTrialTitle(rawTitle) {
  const title = norm(rawTitle);
  const yearMatch = title.match(/\((19\d{2}|20\d{2})\)/) ?? title.match(/\b(19\d{2}|20\d{2})\b/);
  const year = yearMatch && +yearMatch[1] >= YEAR_MIN && +yearMatch[1] <= YEAR_MAX ? +yearMatch[1] : null;

  // The head: text before " - ", ":", "(" or the end, without a trailing "trial"
  const head = title
    .split(/\s+[-–—|]\s+|\s*:\s+|\s*\(/)[0]
    .replace(/\s+(trials?|study)$/i, '')
    .trim();
  const tokens = head.split(/\s+/).filter(Boolean);
  const isName = (t) => /^[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*$/.test(t) && t.length <= 30 && !NOT_ACRONYMS.has(t.toLowerCase());
  const isNumber = (t) => /^(\d{1,2}|[IVX]{1,4})$/.test(t);

  let acronym = '';
  if (tokens.length === 1 && isName(tokens[0])) acronym = tokens[0];
  else if (tokens.length === 2 && isName(tokens[0]) && isNumber(tokens[1])) acronym = `${tokens[0]} ${tokens[1]}`;

  if (!acronym) {
    const several = [...new Set(capsWords(title))];
    return {
      acronym: '',
      year: null,
      sure: false,
      reason:
        several.length > 1 && /\b(and|vs\.?|versus|&)\b/i.test(title)
          ? `Title names several trials (${several.join(', ')}): fill in one, and add a row per extra trial (same note_id)`
          : 'Title does not name one trial: fill in the acronym (and year), or leave as skip',
    };
  }

  acronym = acronym.toUpperCase();
  const reasons = [];
  // A plain capitalised word is only a trial name if the title says so or has
  // more after it ("Aristotle (2011) Trial - …", "Averroes - …")
  const allCaps = tokens[0] === tokens[0].toUpperCase();
  const separated = head.length < title.length;
  if (!allCaps && !separated && !/\btrials?\b/i.test(title)) reasons.push('check the acronym');
  if (year === null) reasons.push('no year in the title: add it if known');
  return {
    acronym,
    year,
    sure: reasons.length === 0,
    reason: reasons.length ? `Parsed ${acronym}; ${reasons.join('; ')}` : `Parsed ${acronym} ${year} from the title`,
  };
}

const trialKey = (userId, acronym, year) => `${userId}|${key(acronym)}|${year ?? ''}`;

/** Draft rows for every trial note in the inventory. Pure. */
export function suggestRows(inventory) {
  const notes = inventory.notes ?? [];
  const existing = new Map();
  const byAcronym = new Map();
  for (const t of inventory.trials ?? []) {
    existing.set(trialKey(t.user_id, t.acronym, t.year), t);
    const k = `${t.user_id}|${key(t.acronym)}`;
    byAcronym.set(k, [...(byAcronym.get(k) ?? []), t]);
  }

  return notes.map((n) => {
    const p = parseTrialTitle(n.title);
    let reason = p.reason;
    if (p.acronym) {
      const exact = existing.get(trialKey(n.user_id, p.acronym, p.year));
      const same = byAcronym.get(`${n.user_id}|${key(p.acronym)}`) ?? [];
      if (exact) reason += '; links to the existing trial';
      else if (p.year === null && same.length === 1) reason += `; links to the existing ${same[0].acronym}${same[0].year ? ` ${same[0].year}` : ''}`;
      else reason += '; creates the trial';
    }
    return {
      action: p.acronym ? 'create_or_link' : 'skip',
      note_id: n.note_id,
      title: n.title,
      acronym: p.acronym,
      year: p.year ?? '',
      new_type: DEFAULT_NEW_TYPE,
      review: p.sure ? '' : 'yes',
      reason,
      topics: (n.topics ?? []).join(' | ') || '(none yet: run the tag migration first)',
      user_id: n.user_id,
    };
  });
}

/** Returns { rows, errors, warnings } with rows normalized for apply. */
export function validateRows(rawRows) {
  const errors = [];
  const warnings = [];
  const rows = [];
  const seen = new Map();
  const typeOf = new Map();

  rawRows.forEach((raw, i) => {
    const line = i + 2;
    const yearText = norm(raw.year);
    const r = {
      action: key(raw.action),
      note_id: norm(raw.note_id),
      acronym: norm(raw.acronym),
      year: yearText === '' ? null : Number(yearText),
      new_type: key(raw.new_type),
      user_id: norm(raw.user_id),
      title: norm(raw.title),
    };
    const where = `row ${line} (${r.title || r.note_id || 'no note'})`;
    if (!UUID_RE.test(r.note_id)) errors.push(`${where}: note_id is not a UUID`);
    if (!UUID_RE.test(r.user_id)) errors.push(`${where}: user_id is not a UUID`);
    if (!ACTIONS.includes(r.action)) errors.push(`${where}: action must be create_or_link or skip (got "${raw.action}")`);

    if (r.action === 'create_or_link') {
      if (!r.acronym) errors.push(`${where}: create_or_link needs an acronym`);
      if (r.acronym.length > 60) errors.push(`${where}: acronym is longer than 60 characters`);
      if (r.year !== null && !(Number.isInteger(r.year) && r.year >= YEAR_MIN && r.year <= YEAR_MAX)) {
        errors.push(`${where}: year must be blank or a year between ${YEAR_MIN} and ${YEAR_MAX} (got "${raw.year}")`);
      }
      if (!NEW_TYPES.includes(r.new_type)) {
        errors.push(`${where}: new_type must be one of ${NEW_TYPES.join(', ')} (got "${raw.new_type ?? ''}")`);
      }
      const k = `${r.note_id}|${key(r.acronym)}|${r.year ?? ''}`;
      if (seen.has(k)) errors.push(`${where}: same note and trial as row ${seen.get(k)}`);
      else seen.set(k, line);
      const prev = typeOf.get(r.note_id);
      if (prev && prev.type !== r.new_type) errors.push(`${where}: new_type differs from row ${prev.line} for the same note`);
      else if (!prev) typeOf.set(r.note_id, { type: r.new_type, line });
    } else if (r.action === 'skip' && r.acronym) {
      warnings.push(`${where}: action=skip, so the acronym is ignored`);
    }
    rows.push(r);
  });

  return { rows, errors, warnings };
}

const sqlNullable = (s) => (s === null || s === '' ? 'NULL' : sqlText(s));

/** Builds the apply script. Rows must come from validateRows. */
export function buildApplySql(rows, { commit = false, source = 'trial-notes' } = {}) {
  const used = rows.filter((r) => r.action === 'create_or_link');
  const skipped = rows.filter((r) => r.action === 'skip');
  const values = used
    .map(
      (r) =>
        `  (${sqlText(r.note_id)}::uuid, ${sqlText(r.user_id)}::uuid, ${sqlText(r.acronym)}, ` +
        `${r.year === null ? 'NULL' : r.year}, ${sqlText(r.new_type)})`
    )
    .join(',\n');
  const skipValues = skipped.map((r) => `  (${sqlText(r.note_id)}::uuid, ${sqlNullable(r.title)})`).join(',\n');

  return `--
-- Trial notes -> trial records, generated from ${source} on ${new Date().toISOString().slice(0, 10)}.
-- ${commit ? 'COMMITS its changes.' : 'DRY RUN: ends with ROLLBACK. Read the report, then regenerate with --commit.'}
-- Safe to re-run. Never deletes anything.
-- Rows: ${used.length} create_or_link, ${skipped.length} skip.
--

BEGIN;

-- Snapshot before the first committed run (used by rollback.sql)
CREATE SCHEMA IF NOT EXISTS backup;
REVOKE ALL ON SCHEMA backup FROM public, anon, authenticated;
CREATE TABLE IF NOT EXISTS backup.trials_pre_trialnotes AS SELECT * FROM public.trials;
CREATE TABLE IF NOT EXISTS backup.trial_topics_pre_trialnotes AS SELECT * FROM public.trial_topics;
CREATE TABLE IF NOT EXISTS backup.note_links_pre_trialnotes AS SELECT * FROM public.note_links;
CREATE TABLE IF NOT EXISTS backup.note_types_pre_trialnotes AS SELECT id, content_type FROM public.notes;
REVOKE ALL ON ALL TABLES IN SCHEMA backup FROM public, anon, authenticated;

CREATE TEMP TABLE tn_before ON COMMIT DROP AS
SELECT (SELECT count(*) FROM public.trials) AS trials,
       (SELECT count(*) FROM public.trial_topics) AS trial_topics,
       (SELECT count(*) FROM public.note_links) AS links;

CREATE TEMP TABLE tn_map (note_id uuid, user_id uuid, acronym text, year int, new_type text) ON COMMIT DROP;
${used.length ? `INSERT INTO tn_map VALUES\n${values};` : '-- (no rows to apply)'}

CREATE TEMP TABLE tn_skip (note_id uuid, title text) ON COMMIT DROP;
${skipped.length ? `INSERT INTO tn_skip VALUES\n${skipValues};` : '-- (no skipped rows)'}

CREATE TEMP TABLE tn_log (kind text, detail text) ON COMMIT DROP;

-- Rows whose note no longer exists (or has another owner) are left out
INSERT INTO tn_log
SELECT 'note not found (row ignored)', m.acronym || ' / ' || m.note_id
FROM tn_map m
WHERE NOT EXISTS (SELECT 1 FROM public.notes n WHERE n.id = m.note_id AND n.user_id = m.user_id);
CREATE TEMP TABLE tn_rows ON COMMIT DROP AS
SELECT m.* FROM tn_map m
WHERE EXISTS (SELECT 1 FROM public.notes n WHERE n.id = m.note_id AND n.user_id = m.user_id);

-- 1. Trials: reuse by acronym (ignoring case) and year, or the only trial
--    with that acronym when the row has no year; else create
CREATE TEMP TABLE tn_trials (user_id uuid, acronym_key text, year int, trial_id uuid) ON COMMIT DROP;
DO $$
DECLARE
  r record;
  v uuid;
  n int;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (user_id, lower(acronym), year) user_id, acronym, year
    FROM tn_rows ORDER BY user_id, lower(acronym), year, acronym
  LOOP
    SELECT id INTO v FROM public.trials
    WHERE user_id = r.user_id AND lower(acronym) = lower(r.acronym) AND year IS NOT DISTINCT FROM r.year;
    IF v IS NULL AND r.year IS NULL THEN
      SELECT count(*), min(id::text)::uuid INTO n, v FROM public.trials
      WHERE user_id = r.user_id AND lower(acronym) = lower(r.acronym);
      IF n <> 1 THEN v := NULL; END IF;
    END IF;
    IF v IS NULL THEN
      INSERT INTO public.trials (user_id, acronym, year) VALUES (r.user_id, r.acronym, r.year) RETURNING id INTO v;
      INSERT INTO pg_temp.tn_log VALUES ('trial created', r.acronym || COALESCE(' ' || r.year, ''));
    ELSE
      INSERT INTO pg_temp.tn_log
      SELECT 'trial reused', acronym || COALESCE(' ' || year, '') FROM public.trials WHERE id = v;
    END IF;
    INSERT INTO pg_temp.tn_trials VALUES (r.user_id, lower(r.acronym), r.year, v);
  END LOOP;
END $$;

CREATE TEMP TABLE tn_pairs ON COMMIT DROP AS
SELECT DISTINCT m.note_id, m.user_id, t.trial_id
FROM tn_rows m
JOIN tn_trials t ON t.user_id = m.user_id AND t.acronym_key = lower(m.acronym) AND t.year IS NOT DISTINCT FROM m.year;

-- 2. Note cites trial (existing links are left as they are)
INSERT INTO public.note_links (user_id, source_type, source_id, target_type, target_id, relation)
SELECT user_id, 'note', note_id, 'trial', trial_id, 'cites' FROM tn_pairs
ON CONFLICT ON CONSTRAINT note_links_unique DO NOTHING;

-- 3. The trial is filed under each of the note's topics, in the note's section
INSERT INTO public.trial_topics (trial_id, topic_id, user_id, section_id)
SELECT DISTINCT ON (p.trial_id, nt.topic_id) p.trial_id, nt.topic_id, p.user_id, nt.section_id
FROM tn_pairs p
JOIN public.note_topics nt ON nt.note_id = p.note_id
ORDER BY p.trial_id, nt.topic_id, nt.is_primary DESC
ON CONFLICT (trial_id, topic_id) DO NOTHING;

-- 4. New type, only for notes still typed Trial (later edits are kept)
WITH changed AS (
  UPDATE public.notes n
  SET content_type = x.new_type
  FROM (SELECT DISTINCT ON (note_id) note_id, new_type FROM tn_rows ORDER BY note_id) x
  WHERE n.id = x.note_id AND n.content_type = 'trial'
  RETURNING n.title, x.new_type
)
INSERT INTO tn_log SELECT 'note retyped', left(title, 80) || ' -> ' || new_type FROM changed;

-- Report
SELECT * FROM (
  SELECT 1 AS ord, 'summary' AS section, 'trials created' AS item,
         (SELECT count(*) FROM tn_log WHERE kind = 'trial created')::text AS detail
  UNION ALL SELECT 1, 'summary', 'trials reused', (SELECT count(*) FROM tn_log WHERE kind = 'trial reused')::text
  UNION ALL SELECT 1, 'summary', 'note -> trial links added', ((SELECT count(*) FROM public.note_links) - b.links)::text FROM tn_before b
  UNION ALL SELECT 1, 'summary', 'trial -> topic links added', ((SELECT count(*) FROM public.trial_topics) - b.trial_topics)::text FROM tn_before b
  UNION ALL SELECT 1, 'summary', 'notes retyped', (SELECT count(*) FROM tn_log WHERE kind = 'note retyped')::text
  UNION ALL SELECT 1, 'summary', 'rows skipped', (SELECT count(*) FROM tn_skip)::text
  UNION ALL SELECT 1, 'summary', 'notes still typed Trial', (SELECT count(*) FROM public.notes WHERE content_type = 'trial')::text
  UNION ALL SELECT 2, kind, detail, '' FROM tn_log
  UNION ALL
  SELECT 3, 'trial without topics (note has none yet)', tr.acronym || COALESCE(' ' || tr.year, ''), ''
  FROM (SELECT DISTINCT trial_id FROM tn_pairs) p JOIN public.trials tr ON tr.id = p.trial_id
  WHERE NOT EXISTS (SELECT 1 FROM public.trial_topics tt WHERE tt.trial_id = p.trial_id)
  UNION ALL
  SELECT 4, 'still typed Trial', left(n.title, 80),
         CASE WHEN EXISTS (SELECT 1 FROM tn_skip s WHERE s.note_id = n.id) THEN 'skipped in the mapping' ELSE 'not in the mapping' END
  FROM public.notes n WHERE n.content_type = 'trial'
) r
ORDER BY ord, section, item;

${commit ? 'COMMIT;' : 'ROLLBACK;  -- dry run. Regenerate with --commit (or change this to COMMIT) to apply.'}
`;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function readRows(path) {
  const text = readFileSync(path, 'utf8');
  return path.toLowerCase().endsWith('.json') ? JSON.parse(text) : parseCsv(text);
}

function main() {
  const [command, file, ...rest] = process.argv.slice(2);
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--out') flags.out = rest[++i];
    else if (rest[i] === '--commit') flags.commit = true;
    else throw new Error(`Unknown option ${rest[i]}`);
  }
  const here = dirname(fileURLToPath(import.meta.url));

  if (command === 'export' && file) {
    let inventory = JSON.parse(readFileSync(file, 'utf8'));
    // Accept the raw SQL editor output too ([{ inventory: {...} }])
    if (Array.isArray(inventory)) inventory = inventory[0]?.inventory ?? inventory[0];
    if (inventory.inventory) inventory = inventory.inventory;
    const rows = suggestRows(inventory);
    const outDir = resolve(flags.out ?? join(here, 'out'));
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'trial-notes.csv'), toCsv(rows, COLUMNS));
    writeFileSync(join(outDir, 'trial-notes.json'), JSON.stringify(rows, null, 2) + '\n');
    const parsed = rows.filter((r) => r.acronym).length;
    console.error(
      `Wrote ${rows.length} trial notes to ${join(outDir, 'trial-notes.csv')} (and .json): ` +
        `${parsed} with a parsed acronym, ${rows.length - parsed} to fill in; ` +
        `${rows.filter((r) => r.review).length} marked review=yes.`
    );
    return;
  }

  if ((command === 'check' || command === 'apply') && file) {
    const { rows, errors, warnings } = validateRows(readRows(file));
    warnings.forEach((w) => console.error(`warning: ${w}`));
    if (errors.length) {
      errors.forEach((e) => console.error(`error: ${e}`));
      console.error(`${errors.length} error(s); nothing generated.`);
      process.exit(1);
    }
    if (command === 'check') {
      const n = (a) => rows.filter((r) => r.action === a).length;
      console.error(`OK: ${rows.length} rows (${n('create_or_link')} create_or_link, ${n('skip')} skip).`);
      return;
    }
    process.stdout.write(buildApplySql(rows, { commit: !!flags.commit, source: file.split('/').pop() }));
    return;
  }

  console.error('Usage: trial-notes.mjs export inventory.json [--out DIR]');
  console.error('       trial-notes.mjs check trial-notes.csv');
  console.error('       trial-notes.mjs apply trial-notes.csv [--commit] > apply.sql');
  process.exit(2);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
