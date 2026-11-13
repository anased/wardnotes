#!/usr/bin/env node
/**
 * Tag -> topic migration for WardNotes. Never connects to the database: it
 * reads and writes files, and prints SQL for you to review and run.
 *
 *   1. Inventory (read-only): run scripts/tag-migration/inventory.sql in the
 *      Supabase SQL editor and save the JSON cell as inventory.json.
 *
 *   2. Export a mapping draft:
 *        node scripts/tag-migration/tag-migration.mjs export inventory.json [--out DIR]
 *      Writes DIR/tag-mapping.csv and DIR/tag-mapping.json (DIR defaults to
 *      scripts/tag-migration/out). Every tag gets a suggested action:
 *        topic   -> file notes with this tag under a topic (+ optional parents,
 *                   aliases and section)
 *        section -> the tag names a part of a topic (Pathophysiology, Pearls…);
 *                   notes are filed under that section of their topics
 *        drop    -> ignore the tag (it stays on notes until you remove tags)
 *      Rows marked review=yes need a decision.
 *
 *   3. Edit the CSV (or JSON) and check it:
 *        node scripts/tag-migration/tag-migration.mjs check tag-mapping.csv
 *
 *   4. Generate the apply SQL (dry run: ends with ROLLBACK and a report):
 *        node scripts/tag-migration/tag-migration.mjs apply tag-mapping.csv > apply.sql
 *      Run it, read the report, then regenerate with --commit to apply.
 *      Options: --no-category-fallback (see below).
 *
 * Mapping columns
 *   action    topic | section | drop
 *   tag       the tag as it appears on notes (matched ignoring case/spacing)
 *   topic     topic name; several tags may map to one topic (synonyms). A tag
 *             that differs from its topic's name is added as an alias.
 *   parents   parent paths separated by "|", each root-first with ">", e.g.
 *             "Neurology > Cerebrovascular | Neurology > Neurocritical care"
 *   aliases   extra aliases separated by "|"
 *   section   for action=section: the section name. For action=topic:
 *             optional section to file these notes under in that topic.
 *   note_count, categories, review, reason, sample_titles: information only.
 *   user_id   owner of the tag (keep as exported).
 *
 * What apply does (per user, safe to re-run):
 *   - creates missing topics (an existing topic is reused when the name
 *     matches its name or one of its aliases), adds aliases and parent links
 *     (a link that would create a cycle is skipped and reported)
 *   - links each tagged note to its mapped topics; a note's section tag files
 *     it under that section in each of its topics (sections are created as
 *     needed). A note with only section tags is filed under its category's
 *     topic (the specialty), unless --no-category-fallback.
 *   - existing links are never changed (re-running won't undo edits made in
 *     the app); a primary topic is set only for notes that have none (the most specific
 *     of its new topics: deepest in the tree, then fewest notes, then tag order)
 *   - never changes notes.tags, flashcards or the tags table
 *   - takes a snapshot (backup.*_pre_tagmap) on the first committed run;
 *     scripts/tag-migration/rollback.sql removes what was added since
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ACTIONS = ['topic', 'section', 'drop'];

export const COLUMNS = [
  'action',
  'tag',
  'note_count',
  'topic',
  'parents',
  'aliases',
  'section',
  'review',
  'reason',
  'categories',
  'sample_titles',
  'user_id',
];

/** Standard section names (same list as "Add section" in the app). */
export const SECTION_SUGGESTIONS = [
  'Overview',
  'Pathophysiology',
  'Diagnosis',
  'Management',
  'Trials and evidence',
  'Articles',
  'Clinical questions',
  'Cases',
  'Pearls and pitfalls',
  'Algorithms',
];

/** Words that, alone or together, make a tag a section rather than a topic. */
const SECTION_WORDS = [
  [/^(overview|summary|basics|introduction)$/, 'Overview'],
  [/^(patho\w*|mechanisms?|physiology|etiology|aetiology|causes?)$/, 'Pathophysiology'],
  [/^(diagnos\w*|workup|work-up|investigations?|imaging|differentials?|ddx)$/, 'Diagnosis'],
  [/^(management|treatments?|therapy|therapies|therapeutics)$/, 'Management'],
  [/^(trials?|evidence|rcts?)$/, 'Trials and evidence'],
  [/^(articles?|papers?|reviews?)$/, 'Articles'],
  [/^(questions?|q&a|qa)$/, 'Clinical questions'],
  [/^(cases?)$/, 'Cases'],
  [/^(pearls?|pitfalls?|tips?)$/, 'Pearls and pitfalls'],
  [/^(algorithms?|approach|flowcharts?|pathways?)$/, 'Algorithms'],
  [/^(guidelines?)$/, 'Guidelines'],
];
const FILLER_WORDS = new Set(['and', 'of', 'the', 'clinical', 'key', 'general', '&']);

export const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');
export const key = (s) => norm(s).toLowerCase();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The section a tag names ("Pathophysiology/mechanism" -> Pathophysiology), or null. */
export function sectionForTag(tag) {
  const words = key(tag).split(/[\s/,+-]+/).filter(Boolean);
  if (words.length === 0) return null;
  let found = null;
  for (const w of words) {
    if (FILLER_WORDS.has(w)) continue;
    const hit = SECTION_WORDS.find(([re]) => re.test(w));
    if (!hit) return null;
    found ??= hit[1];
  }
  return found;
}

/** Category with the most notes for a tag ("General" loses ties). */
function topCategory(categories) {
  const entries = Object.entries(categories ?? {});
  if (entries.length === 0) return null;
  const general = (c) => (key(c) === 'general' ? 1 : 0);
  return entries.sort((a, b) => b[1] - a[1] || general(a[0]) - general(b[0]) || a[0].localeCompare(b[0]))[0][0];
}

/** Categories holding a real share of a tag's notes (at least 2 notes and 10%). */
function significantCategories(categories, total) {
  return Object.entries(categories ?? {}).filter(([, n]) => n >= 2 && n / Math.max(1, total) >= 0.1).map(([c]) => c);
}

const titleCase = (s) => (s === s.toLowerCase() ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Suggests a mapping row for every inventory entry. Pure; see the header for
 * what the columns mean.
 */
export function suggestMapping(inventory) {
  const byUser = new Map();
  for (const row of inventory) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
    byUser.get(row.user_id).push(row);
  }

  const out = [];
  for (const [userId, rows] of byUser) {
    // Proxy for the account's size: notes on its most used tag
    const busiestTag = Math.max(1, ...rows.map((r) => r.note_count || 0));
    const taggedNotes = rows.reduce((sum, r) => sum + (r.note_count || 0), 0);
    const categoryNames = new Map();
    for (const r of rows) for (const c of Object.keys(r.categories ?? {})) categoryNames.set(key(c), c);

    // Tags that will become topics, for "nested under" suggestions
    const topicTags = rows.filter((r) => r.note_count > 1 && !sectionForTag(r.tag)).map((r) => norm(r.tag));

    for (const r of rows) {
      const tag = norm(r.tag);
      const cats = r.categories ?? {};
      const crossCategories = significantCategories(cats, r.note_count);
      const category = topCategory(cats);
      const base = {
        tag,
        note_count: r.note_count ?? 0,
        categories: Object.entries(cats).map(([c, n]) => `${c} (${n})`).join('; '),
        sample_titles: (r.sample_titles ?? []).join(' | '),
        user_id: userId,
        topic: '',
        parents: '',
        aliases: '',
        section: '',
        review: '',
        reason: '',
      };

      if (!r.note_count) {
        out.push({ ...base, action: 'drop', reason: 'Not used by any note' });
        continue;
      }

      const section = sectionForTag(tag);
      if (section) {
        out.push({
          ...base,
          action: 'section',
          section,
          reason: SECTION_SUGGESTIONS.includes(section)
            ? `Names a part of a topic (${section})`
            : `Names a part of a topic; custom section "${section}"`,
        });
        continue;
      }

      // The tag is a category name: it is that specialty's root topic
      if (categoryNames.has(key(tag))) {
        out.push({
          ...base,
          action: 'topic',
          topic: categoryNames.get(key(tag)),
          reason: 'Same as a category: the specialty topic',
        });
        continue;
      }

      // Nest under a broader tag contained in this one ("Stroke prevention" under "Stroke")
      const broader = topicTags
        .filter((t) => key(t) !== key(tag) && new RegExp(`(^|\\s)${escapeRe(key(t))}(\\s|$)`).test(key(tag)))
        .sort((a, b) => b.length - a.length)[0];

      const parentRoot = category && !categoryNames.has(key(tag)) ? category : '';
      const parents = broader ? [parentRoot, broader].filter(Boolean).join(' > ') : parentRoot;

      const row = {
        ...base,
        action: 'topic',
        topic: titleCase(tag),
        parents,
        reason: broader ? `Nested under ${broader} (name contains it)` : parentRoot ? `Under ${parentRoot} (its notes' category)` : '',
      };

      // Labels used across specialties or on a large share of the account's
      // notes are probably not topics (exam source, population, setting…)
      if (crossCategories.length > 1 || (r.note_count >= 10 && r.note_count / busiestTag > 0.4)) {
        row.review = 'yes';
        if (crossCategories.length > 1) row.parents = '';
        row.reason =
          crossCategories.length > 1
            ? `Used across ${crossCategories.join(' and ')}: a topic, a section, or drop?`
            : `On ${r.note_count} notes (a large share): a cross-cutting label (exam, population, setting)? Topic, section, or drop?`;
      } else if (taggedNotes <= 3) {
        row.review = 'yes';
        row.reason = `Account with only ${taggedNotes} tagged ${taggedNotes === 1 ? 'note' : 'notes'} (test account?)`;
      }
      out.push(row);
    }
  }
  return out;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export function toCsv(rows, columns = COLUMNS) {
  const cell = (v) => {
    const s = v === undefined || v === null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (!header) return [];
  const cols = header.map((h) => key(h));
  return body.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i] ?? ''])));
}

export function readMapping(path) {
  const text = readFileSync(path, 'utf8');
  return path.toLowerCase().endsWith('.json') ? JSON.parse(text) : parseCsv(text);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const splitList = (s, sep = '|') => String(s ?? '').split(sep).map(norm).filter(Boolean);

/** Parent paths of a row: [["Neurology", "Cerebrovascular"], ...]. */
export const parentPaths = (row) => splitList(row.parents).map((p) => splitList(p, '>'));

/** Returns { rows, errors, warnings } with rows normalized for apply. */
export function validateMapping(rawRows) {
  const errors = [];
  const warnings = [];
  const rows = [];
  const seen = new Map();

  rawRows.forEach((raw, i) => {
    const line = i + 2; // header is line 1
    const r = {
      action: key(raw.action),
      tag: norm(raw.tag),
      topic: norm(raw.topic),
      parents: norm(raw.parents),
      aliases: norm(raw.aliases),
      section: norm(raw.section),
      user_id: norm(raw.user_id),
    };
    const where = `row ${line} (${r.tag || 'no tag'})`;
    if (!r.tag) errors.push(`${where}: tag is empty`);
    if (!UUID_RE.test(r.user_id)) errors.push(`${where}: user_id is not a UUID`);
    if (!ACTIONS.includes(r.action)) errors.push(`${where}: action must be topic, section or drop (got "${raw.action}")`);
    if (r.action === 'topic' && !r.topic) errors.push(`${where}: action=topic needs a topic name`);
    if (r.action === 'section' && !r.section) errors.push(`${where}: action=section needs a section name`);
    if (r.topic.length > 120) errors.push(`${where}: topic name is longer than 120 characters`);
    if (r.section.length > 80) errors.push(`${where}: section name is longer than 80 characters`);
    for (const path of parentPaths(r)) {
      if (path.some((p) => key(p) === key(r.topic))) errors.push(`${where}: "${r.topic}" can't be its own parent`);
    }
    if (r.action === 'drop' && (r.topic || r.section)) warnings.push(`${where}: action=drop, so topic/section are ignored`);
    if (r.action === 'section' && r.topic) warnings.push(`${where}: action=section ignores the topic column`);

    const k = `${r.user_id}|${key(r.tag)}`;
    if (seen.has(k)) errors.push(`${where}: tag also mapped on row ${seen.get(k)}`);
    else seen.set(k, line);
    rows.push(r);
  });

  // The same topic with different capitalisation would be merged anyway
  const spellings = new Map();
  for (const r of rows.filter((x) => x.action === 'topic')) {
    const k = `${r.user_id}|${key(r.topic)}`;
    const prev = spellings.get(k);
    if (prev && prev !== r.topic) warnings.push(`"${prev}" and "${r.topic}" are the same topic; the first spelling is used`);
    else spellings.set(k, r.topic);
  }

  return { rows, errors, warnings };
}

// ---------------------------------------------------------------------------
// SQL generation
// ---------------------------------------------------------------------------

export const sqlText = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sqlArray = (items) => (items.length ? `ARRAY[${items.map(sqlText).join(', ')}]::text[]` : `'{}'::text[]`);
const sqlNullable = (s) => (s ? sqlText(s) : 'NULL');

/** Builds the apply script. Rows must come from validateMapping. */
export function buildApplySql(rows, { commit = false, categoryFallback = true, source = 'tag-mapping' } = {}) {
  const used = rows.filter((r) => r.action !== 'drop');
  const values = used
    .map(
      (r) =>
        `  (${sqlText(r.user_id)}::uuid, ${sqlText(r.tag)}, ${sqlText(r.action)}, ${sqlNullable(r.topic)}, ` +
        `${sqlArray(splitList(r.parents))}, ${sqlArray(splitList(r.aliases))}, ${sqlNullable(r.section)})`
    )
    .join(',\n');
  const sectionOrder = SECTION_SUGGESTIONS.map((s, i) => `('${s.toLowerCase().replace(/'/g, "''")}', ${i + 1})`).join(', ');

  return `--
-- Tag -> topic migration, generated from ${source} on ${new Date().toISOString().slice(0, 10)}.
-- ${commit ? 'COMMITS its changes.' : 'DRY RUN: ends with ROLLBACK. Read the report, then regenerate with --commit.'}
-- Safe to re-run. Never changes notes.tags, flashcards or the tags table.
-- Mapping rows used: ${used.length} (${rows.length - used.length} dropped).
--

BEGIN;

-- Snapshot before the first committed run (used by rollback.sql)
CREATE SCHEMA IF NOT EXISTS backup;
REVOKE ALL ON SCHEMA backup FROM public, anon, authenticated;
CREATE TABLE IF NOT EXISTS backup.topics_pre_tagmap AS SELECT * FROM public.topics;
CREATE TABLE IF NOT EXISTS backup.topic_edges_pre_tagmap AS SELECT * FROM public.topic_edges;
CREATE TABLE IF NOT EXISTS backup.topic_sections_pre_tagmap AS SELECT * FROM public.topic_sections;
CREATE TABLE IF NOT EXISTS backup.note_topics_pre_tagmap AS SELECT * FROM public.note_topics;
REVOKE ALL ON ALL TABLES IN SCHEMA backup FROM public, anon, authenticated;

CREATE TEMP TABLE tm_before ON COMMIT DROP AS
SELECT (SELECT count(*) FROM public.topics) AS topics,
       (SELECT count(*) FROM public.topic_edges) AS edges,
       (SELECT count(*) FROM public.topic_sections) AS sections,
       (SELECT count(*) FROM public.note_topics) AS links,
       (SELECT count(*) FROM public.note_topics WHERE is_primary) AS primaries;

CREATE TEMP TABLE tm_map (
  user_id uuid, tag text, action text, topic text, parents text[], aliases text[], section text
) ON COMMIT DROP;
${used.length ? `INSERT INTO tm_map VALUES\n${values};` : '-- (no rows to apply)'}

CREATE TEMP TABLE tm_log (kind text, detail text) ON COMMIT DROP;
CREATE TEMP TABLE tm_section_order (name text PRIMARY KEY, ord int) ON COMMIT DROP;
INSERT INTO tm_section_order VALUES ${sectionOrder};

-- Topic by name or alias (ignoring case), created when missing
CREATE FUNCTION pg_temp.tm_topic(p_user uuid, p_name text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v uuid;
  n text := public.normalize_tag_name(p_name);
BEGIN
  SELECT id INTO v FROM public.topics WHERE user_id = p_user AND lower(name) = lower(n);
  IF v IS NULL THEN
    SELECT id INTO v FROM public.topics
    WHERE user_id = p_user AND EXISTS (SELECT 1 FROM unnest(aliases) a WHERE lower(a) = lower(n))
    ORDER BY created_at LIMIT 1;
  END IF;
  IF v IS NULL THEN
    INSERT INTO public.topics (user_id, name) VALUES (p_user, n) RETURNING id INTO v;
    INSERT INTO pg_temp.tm_log VALUES ('topic created', n);
  END IF;
  RETURN v;
END $$;

-- Parent link; one that would make a cycle is skipped and reported
CREATE FUNCTION pg_temp.tm_edge(p_user uuid, p_parent uuid, p_child uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_parent = p_child THEN RETURN; END IF;
  INSERT INTO public.topic_edges (parent_id, child_id, user_id) VALUES (p_parent, p_child, p_user)
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN check_violation THEN
  INSERT INTO pg_temp.tm_log
  SELECT 'parent link skipped (would create a cycle)',
         (SELECT name FROM public.topics WHERE id = p_parent) || ' > ' || (SELECT name FROM public.topics WHERE id = p_child);
END $$;

-- "A > B > C": creates/reuses each topic and links them; returns the last
CREATE FUNCTION pg_temp.tm_path(p_user uuid, p_path text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  part text;
  prev uuid;
  cur uuid;
BEGIN
  FOREACH part IN ARRAY string_to_array(p_path, '>') LOOP
    part := public.normalize_tag_name(part);
    CONTINUE WHEN part = '';
    cur := pg_temp.tm_topic(p_user, part);
    IF prev IS NOT NULL THEN PERFORM pg_temp.tm_edge(p_user, prev, cur); END IF;
    prev := cur;
  END LOOP;
  RETURN prev;
END $$;

-- 1. Topics, aliases and parents
DO $$
DECLARE
  r record;
  t uuid;
  p text;
  extra text[];
BEGIN
  FOR r IN SELECT * FROM tm_map WHERE action = 'topic' ORDER BY user_id, lower(topic), lower(tag) LOOP
    t := pg_temp.tm_topic(r.user_id, r.topic);

    -- The tag becomes an alias when it differs from the topic name
    SELECT array_agg(a) INTO extra
    FROM (
      SELECT DISTINCT ON (lower(public.normalize_tag_name(a))) public.normalize_tag_name(a) AS a
      FROM unnest(r.aliases || ARRAY[r.tag]) a
    ) x, public.topics tp
    WHERE tp.id = t
      AND x.a <> ''
      AND lower(x.a) <> lower(tp.name)
      AND NOT EXISTS (SELECT 1 FROM unnest(tp.aliases) e WHERE lower(e) = lower(x.a));
    IF extra IS NOT NULL THEN
      UPDATE public.topics SET aliases = aliases || extra WHERE id = t;
      INSERT INTO tm_log SELECT 'alias added', (SELECT name FROM public.topics WHERE id = t) || ': ' || e FROM unnest(extra) e;
    END IF;

    FOREACH p IN ARRAY r.parents LOOP
      PERFORM pg_temp.tm_edge(r.user_id, pg_temp.tm_path(r.user_id, p), t);
    END LOOP;
  END LOOP;
END $$;

-- 2. Which topics (and sections) each tagged note should be filed under
CREATE TEMP TABLE tm_hits ON COMMIT DROP AS
SELECT n.id AS note_id, n.user_id, n.category, m.action, m.topic, m.section, u.ord
FROM public.notes n
CROSS JOIN LATERAL unnest(n.tags) WITH ORDINALITY AS u(tag, ord)
JOIN tm_map m
  ON m.user_id = n.user_id
 AND lower(public.normalize_tag_name(m.tag)) = lower(public.normalize_tag_name(u.tag));

CREATE TEMP TABLE tm_links ON COMMIT DROP AS
WITH topic_rows AS (
  SELECT note_id, user_id, pg_temp.tm_topic(user_id, topic) AS topic_id, section, ord
  FROM tm_hits WHERE action = 'topic'
),
fallback_rows AS (
  -- Notes with only section tags go under their category's topic
  SELECT DISTINCT ON (note_id) note_id, user_id, pg_temp.tm_topic(user_id, category) AS topic_id, NULL::text AS section, 0::bigint AS ord
  FROM tm_hits h
  WHERE ${categoryFallback ? 'true' : 'false'}
    AND h.action = 'section'
    AND NOT EXISTS (SELECT 1 FROM tm_hits x WHERE x.note_id = h.note_id AND x.action = 'topic')
  ORDER BY note_id
),
note_section AS (
  SELECT DISTINCT ON (note_id) note_id, section FROM tm_hits WHERE action = 'section' ORDER BY note_id, ord
),
merged AS (
  SELECT r.note_id, r.user_id, r.topic_id, COALESCE(r.section, s.section) AS section, r.ord
  FROM (SELECT * FROM topic_rows UNION ALL SELECT * FROM fallback_rows) r
  LEFT JOIN note_section s ON s.note_id = r.note_id
)
SELECT DISTINCT ON (note_id, topic_id) note_id, user_id, topic_id, public.normalize_tag_name(section) AS section, ord
FROM merged
ORDER BY note_id, topic_id, ord;

-- 3. Sections the links need (standard ones keep the app's suggested order)
INSERT INTO public.topic_sections (topic_id, user_id, name, sort_order)
SELECT DISTINCT ON (l.topic_id, lower(l.section)) l.topic_id, l.user_id, l.section,
       COALESCE(o.ord, 100)
FROM tm_links l
LEFT JOIN tm_section_order o ON o.name = lower(l.section)
WHERE l.section IS NOT NULL AND l.section <> ''
ON CONFLICT (topic_id, lower(name)) DO NOTHING;

-- 4. Note links: new ones are added; existing ones (from an earlier run or
--    made in the app) are left exactly as they are
INSERT INTO public.note_topics (note_id, topic_id, user_id, section_id, is_primary)
SELECT l.note_id, l.topic_id, l.user_id, s.id, false
FROM tm_links l
LEFT JOIN public.topic_sections s ON s.topic_id = l.topic_id AND lower(s.name) = lower(l.section)
ON CONFLICT (note_id, topic_id) DO NOTHING;

-- 5. A primary topic for notes that have none: the most specific new topic
--    (deepest in the tree, then used by the fewest notes, then tag order)
CREATE TEMP TABLE tm_depth ON COMMIT DROP AS
WITH RECURSIVE up(topic_id, cur, depth) AS (
  SELECT DISTINCT topic_id, topic_id, 0 FROM tm_links
  UNION ALL
  SELECT u.topic_id, e.parent_id, u.depth + 1
  FROM up u JOIN public.topic_edges e ON e.child_id = u.cur
  WHERE u.depth < 50
)
SELECT topic_id, max(depth) AS depth FROM up GROUP BY topic_id;

UPDATE public.note_topics nt
SET is_primary = true
FROM (
  SELECT DISTINCT ON (note_id) note_id, topic_id
  FROM (
    SELECT l.*, d.depth, count(*) OVER (PARTITION BY l.topic_id) AS uses
    FROM tm_links l JOIN tm_depth d USING (topic_id)
  ) x
  ORDER BY note_id, depth DESC, uses, ord
) first
WHERE nt.note_id = first.note_id
  AND nt.topic_id = first.topic_id
  AND NOT EXISTS (SELECT 1 FROM public.note_topics p WHERE p.note_id = nt.note_id AND p.is_primary);

-- Report
SELECT * FROM (
  SELECT 1 AS ord, 'summary' AS section, 'topics added' AS item,
         ((SELECT count(*) FROM public.topics) - b.topics)::text AS detail FROM tm_before b
  UNION ALL SELECT 1, 'summary', 'parent links added', ((SELECT count(*) FROM public.topic_edges) - b.edges)::text FROM tm_before b
  UNION ALL SELECT 1, 'summary', 'sections added', ((SELECT count(*) FROM public.topic_sections) - b.sections)::text FROM tm_before b
  UNION ALL SELECT 1, 'summary', 'note links added', ((SELECT count(*) FROM public.note_topics) - b.links)::text FROM tm_before b
  UNION ALL SELECT 1, 'summary', 'primary topics set', ((SELECT count(*) FROM public.note_topics WHERE is_primary) - b.primaries)::text FROM tm_before b
  UNION ALL SELECT 1, 'summary', 'notes filed', (SELECT count(DISTINCT note_id) FROM tm_links)::text
  UNION ALL SELECT 1, 'summary', 'tagged notes not filed (only dropped tags)',
         (SELECT count(*) FROM public.notes n
          WHERE n.user_id IN (SELECT user_id FROM tm_map) AND cardinality(n.tags) > 0
            AND NOT EXISTS (SELECT 1 FROM tm_links l WHERE l.note_id = n.id))::text
  UNION ALL SELECT 2, kind, detail, '' FROM tm_log
  UNION ALL
  SELECT 3, 'notes per topic', t.name, count(*)::text
  FROM tm_links l JOIN public.topics t ON t.id = l.topic_id
  GROUP BY t.name
  UNION ALL
  SELECT 4, 'tagged note not filed', left(n.title, 80), array_to_string(n.tags, ', ')
  FROM public.notes n
  WHERE n.user_id IN (SELECT user_id FROM tm_map) AND cardinality(n.tags) > 0
    AND NOT EXISTS (SELECT 1 FROM tm_links l WHERE l.note_id = n.id)
) r
ORDER BY ord, section, item;

${commit ? 'COMMIT;' : 'ROLLBACK;  -- dry run. Regenerate with --commit (or change this to COMMIT) to apply.'}
`;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const [command, file, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--out') flags.out = rest[++i];
    else if (a === '--commit') flags.commit = true;
    else if (a === '--no-category-fallback') flags.categoryFallback = false;
    else throw new Error(`Unknown option ${a}`);
  }
  return { command, file, flags };
}

function main() {
  const { command, file, flags } = parseArgs(process.argv.slice(2));
  const here = dirname(fileURLToPath(import.meta.url));

  if (command === 'export' && file) {
    let inventory = JSON.parse(readFileSync(file, 'utf8'));
    // Accept the raw SQL editor output too ([{ inventory: [...] }])
    if (Array.isArray(inventory) && inventory[0]?.inventory) inventory = inventory[0].inventory;
    if (!Array.isArray(inventory)) inventory = inventory.inventory;
    const rows = suggestMapping(inventory);
    const outDir = resolve(flags.out ?? join(here, 'out'));
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'tag-mapping.csv'), toCsv(rows));
    writeFileSync(join(outDir, 'tag-mapping.json'), JSON.stringify(rows, null, 2) + '\n');
    const counts = Object.fromEntries(ACTIONS.map((a) => [a, rows.filter((r) => r.action === a).length]));
    console.error(
      `Wrote ${rows.length} tags to ${join(outDir, 'tag-mapping.csv')} (and .json): ` +
        `${counts.topic} topic, ${counts.section} section, ${counts.drop} drop; ` +
        `${rows.filter((r) => r.review).length} marked review=yes.`
    );
    return;
  }

  if ((command === 'check' || command === 'apply') && file) {
    const { rows, errors, warnings } = validateMapping(readMapping(file));
    warnings.forEach((w) => console.error(`warning: ${w}`));
    if (errors.length) {
      errors.forEach((e) => console.error(`error: ${e}`));
      console.error(`${errors.length} error(s); nothing generated.`);
      process.exit(1);
    }
    if (command === 'check') {
      const n = (a) => rows.filter((r) => r.action === a).length;
      console.error(`OK: ${rows.length} rows (${n('topic')} topic, ${n('section')} section, ${n('drop')} drop).`);
      return;
    }
    process.stdout.write(
      buildApplySql(rows, { commit: !!flags.commit, categoryFallback: flags.categoryFallback !== false, source: file.split('/').pop() })
    );
    return;
  }

  console.error('Usage: tag-migration.mjs export inventory.json [--out DIR]');
  console.error('       tag-migration.mjs check tag-mapping.csv');
  console.error('       tag-migration.mjs apply tag-mapping.csv [--commit] [--no-category-fallback] > apply.sql');
  process.exit(2);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
