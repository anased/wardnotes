// Run with: node --test scripts/tag-migration/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SECTION_SUGGESTIONS,
  buildApplySql,
  parentPaths,
  parseCsv,
  sectionForTag,
  sqlText,
  suggestMapping,
  toCsv,
  validateMapping,
} from './tag-migration.mjs';

const U = '5079b1fe-6b16-444b-9556-927b6879666d';
const inv = (tag, note_count, categories = { Neurology: note_count }) => ({
  user_id: U,
  tag,
  note_count,
  categories,
  sample_titles: [],
});

test('sectionForTag recognises section-like tags only', () => {
  assert.equal(sectionForTag('Pathophysiology/mechanism'), 'Pathophysiology');
  assert.equal(sectionForTag('Clinical pearls'), 'Pearls and pitfalls');
  assert.equal(sectionForTag('Clinical guidelines'), 'Guidelines');
  assert.equal(sectionForTag('Diagnosis'), 'Diagnosis');
  assert.equal(sectionForTag('Management of ICH'), null);
  assert.equal(sectionForTag('Acute stroke management'), null);
  assert.equal(sectionForTag('PRES'), null);
});

test('articles, questions and cases are no longer sections', () => {
  assert.equal(sectionForTag('Articles'), null);
  assert.equal(sectionForTag('Clinical questions'), null);
  assert.equal(sectionForTag('Cases'), null);
  assert.ok(!SECTION_SUGGESTIONS.includes('Articles'));
  assert.ok(!SECTION_SUGGESTIONS.includes('Clinical questions'));
  assert.ok(!SECTION_SUGGESTIONS.includes('Cases'));
});

test('suggestMapping: topics under their category, sections, drops and nesting', () => {
  const rows = suggestMapping([
    inv('RITE', 109, { Neurology: 107, General: 1, Cardiology: 1 }),
    inv('Stroke', 33, { Neurology: 32, General: 1 }),
    inv('Stroke prevention', 2),
    inv('Pathophysiology/mechanism', 1),
    inv('BAD', 1),
    inv('neurology', 1),
    inv('unused', 0, {}),
    inv('Pediatric', 54, { Neurology: 30, Cardiology: 24 }),
  ]);
  const by = Object.fromEntries(rows.map((r) => [r.tag, r]));
  // Cross-cutting labels are kept as labels, flagged for review
  assert.deepEqual([by.RITE.action, by.RITE.review, by.RITE.topic], ['keep', 'yes', '']); // large share
  assert.match(by.RITE.reason, /Cross-cutting label .*large share/);
  assert.equal(by.Stroke.review, ''); // one stray note elsewhere doesn't count
  assert.equal(by.Stroke.parents, 'Neurology');
  assert.equal(by['Stroke prevention'].parents, 'Neurology > Stroke');
  assert.equal(by['Pathophysiology/mechanism'].action, 'section');
  assert.equal(by['Pathophysiology/mechanism'].section, 'Pathophysiology');
  assert.deepEqual([by.BAD.action, by.BAD.topic, by.BAD.parents], ['topic', 'BAD', 'Neurology']);
  assert.deepEqual([by.neurology.topic, by.neurology.parents], ['Neurology', '']);
  assert.equal(by.unused.action, 'drop');
  assert.deepEqual([by.Pediatric.action, by.Pediatric.review, by.Pediatric.parents], ['keep', 'yes', '']);
  assert.match(by.Pediatric.reason, /used across Neurology and Cardiology/);
});

test('CSV round trip keeps commas, quotes and newlines', () => {
  const rows = [{ action: 'topic', tag: 'Parkinson\'s, "PD"', topic: 'PD\nnew', user_id: U }];
  const back = parseCsv(toCsv(rows));
  assert.equal(back[0].tag, 'Parkinson\'s, "PD"');
  assert.equal(back[0].topic, 'PD\nnew');
  assert.equal(back[0].parents, '');
});

test('validateMapping reports actionable errors', () => {
  const { errors } = validateMapping([
    { action: 'topic', tag: 'A', topic: '', user_id: U },
    { action: 'section', tag: 'B', section: '', user_id: U },
    { action: 'maybe', tag: 'C', user_id: U },
    { action: 'topic', tag: 'D', topic: 'D', parents: 'Neurology > D', user_id: U },
    { action: 'drop', tag: 'a', user_id: U },
    { action: 'topic', tag: 'E', topic: 'E', user_id: 'nope' },
  ]);
  assert.match(errors.join('\n'), /row 2 \(A\): action=topic needs a topic name/);
  assert.match(errors.join('\n'), /row 3 \(B\): action=section needs a section name/);
  assert.match(errors.join('\n'), /row 4 \(C\): action must be/);
  assert.match(errors.join('\n'), /row 5 \(D\): "D" can't be its own parent/);
  assert.match(errors.join('\n'), /row 6 \(a\): tag also mapped on row 2/);
  assert.match(errors.join('\n'), /row 7 \(E\): user_id is not a UUID/);
});

test('validateMapping accepts keep and warns about ignored columns', () => {
  const { rows, errors, warnings } = validateMapping([
    { action: 'keep', tag: 'RITE', user_id: U },
    { action: 'Keep', tag: 'Pediatric', topic: 'Pediatrics', user_id: U },
  ]);
  assert.deepEqual(errors, []);
  assert.deepEqual(rows.map((r) => r.action), ['keep', 'keep']);
  assert.match(warnings.join('\n'), /row 3 \(Pediatric\): action=keep, so topic\/parents\/section are ignored/);
});

test('parentPaths splits several root-first paths', () => {
  assert.deepEqual(parentPaths({ parents: 'Neurology > Cerebrovascular | Neurology>Neurocritical care' }), [
    ['Neurology', 'Cerebrovascular'],
    ['Neurology', 'Neurocritical care'],
  ]);
});

test('buildApplySql quotes values, skips dropped rows and is a dry run by default', () => {
  const { rows } = validateMapping([
    { action: 'topic', tag: "Parkinson's disease", topic: "Parkinson's disease", parents: 'Neurology', user_id: U },
    { action: 'drop', tag: 'note', user_id: U },
  ]);
  const sql = buildApplySql(rows);
  assert.ok(sql.includes(sqlText("Parkinson's disease")));
  assert.ok(!sql.includes("'note'"));
  assert.match(sql, /ROLLBACK;  -- dry run/);
  assert.match(buildApplySql(rows, { commit: true }), /\nCOMMIT;\n$/);
  assert.match(sql, /WHERE true\n  AND public\.normalize_tag_name\(COALESCE\(n\.category/);
  assert.match(buildApplySql(rows, { categoryFallback: false }), /WHERE false\n/);
  assert.match(sql, /notes filed under their category/);
  assert.ok(!/notes\s+SET\s+tags/i.test(sql) && !/DELETE FROM public\.(notes|tags)/i.test(sql));
});

test('buildApplySql: kept labels are reported, never mapped', () => {
  const { rows } = validateMapping([
    { action: 'keep', tag: 'RITE', user_id: U },
    { action: 'topic', tag: 'PRES', topic: 'PRES', user_id: U },
  ]);
  const sql = buildApplySql(rows);
  assert.match(sql, /INSERT INTO tm_kept VALUES\n  \('[0-9a-f-]+'::uuid, 'RITE'\);/);
  assert.ok(!/INSERT INTO tm_map VALUES[^;]*'RITE'/.test(sql));
  assert.match(sql, /'label kept'/);
  assert.match(sql, /kept as labels: 1; dropped: 0/);
});

test('buildApplySql: aliases that name an existing topic merge it (renamed before topics are created)', () => {
  const { rows } = validateMapping([
    { action: 'topic', tag: 'Stroke', topic: 'Stroke', parents: 'Neurology', aliases: 'ischemic stroke', user_id: U },
  ]);
  const sql = buildApplySql(rows);
  const merge = sql.indexOf('-- 0. Merges');
  assert.ok(merge > 0 && merge < sql.indexOf('-- 1. Topics, aliases and parents'));
  assert.match(sql, /'topic renamed \(merged\)'/);
  assert.ok(!/DELETE FROM public\.topics/.test(sql));
});
