// Run with: npm run test:scripts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApplySql, parseTrialTitle, suggestRows, validateRows } from './trial-notes.mjs';
import { parseCsv, toCsv } from '../tag-migration/tag-migration.mjs';
import { COLUMNS } from './trial-notes.mjs';

const U = '5079b1fe-6b16-444b-9556-927b6879666d';
const N1 = '21888ae9-e1bc-41a1-aaf0-1c52efd88a30';
const N2 = '8f6c8e93-c6f6-4b8a-abd5-bc103f4247b6';

test('parseTrialTitle: acronym and year from the title', () => {
  assert.deepEqual(
    parseTrialTitle('Aristotle (2011) Trial - Apixaban vs Warfarin in AFib for prevention of stroke'),
    { acronym: 'ARISTOTLE', year: 2011, sure: true, reason: 'Parsed ARISTOTLE 2011 from the title' }
  );
  const averroes = parseTrialTitle('Averroes - Apixaban vs Aspirin in Afib for prevention of stroke');
  assert.deepEqual([averroes.acronym, averroes.year, averroes.sure], ['AVERROES', null, false]);
  assert.match(averroes.reason, /no year in the title/);
  assert.deepEqual(
    [parseTrialTitle('CREST 2 trial').acronym, parseTrialTitle('CREST 2 trial').year],
    ['CREST 2', null]
  );
  assert.equal(parseTrialTitle('PRESTIGE-AF (Prevention of Stroke in ICH Survivors With AF) Trial').acronym, 'PRESTIGE-AF');
  assert.deepEqual(
    [parseTrialTitle('NINDS: tPA 3-hour window, 1995').acronym, parseTrialTitle('NINDS: tPA 3-hour window, 1995').year],
    ['NINDS', 1995]
  );
});

test('parseTrialTitle: unsure titles stay blank', () => {
  for (const t of [
    'The extended window trials',
    'Large-Core Ischemic Stroke Endovascular Treatment',
    'non disabeling stroke trials',
    'Acute management of symptomatic ICAD',
    'Stroke',
    '',
  ]) {
    const p = parseTrialTitle(t);
    assert.equal(p.acronym, '', t);
    assert.equal(p.sure, false, t);
  }
  assert.match(parseTrialTitle('DIFFUSE and DAWN').reason, /several trials \(DIFFUSE, DAWN\).*a row per extra trial/);
});

test('suggestRows: defaults, skip when unsure, and existing trials', () => {
  const rows = suggestRows({
    notes: [
      { note_id: N1, user_id: U, title: 'Aristotle (2011) Trial - Apixaban vs Warfarin', topics: ['Stroke prevention', 'Afib'] },
      { note_id: N2, user_id: U, title: 'Averroes - Apixaban vs Aspirin', topics: [] },
      { note_id: N2.replace('8f', '9f'), user_id: U, title: 'DIFFUSE and DAWN', topics: [] },
    ],
    trials: [{ user_id: U, acronym: 'Averroes', year: 2011 }],
  });
  assert.deepEqual(
    rows.map((r) => [r.action, r.acronym, r.year, r.new_type, r.review]),
    [
      ['create_or_link', 'ARISTOTLE', 2011, 'review', ''],
      ['create_or_link', 'AVERROES', '', 'review', 'yes'],
      ['skip', '', '', 'review', 'yes'],
    ]
  );
  assert.match(rows[0].reason, /creates the trial/);
  assert.match(rows[1].reason, /links to the existing Averroes 2011/);
  assert.equal(rows[0].topics, 'Stroke prevention | Afib');
  assert.match(rows[1].topics, /run the tag migration first/);
  // CSV round trip
  assert.equal(parseCsv(toCsv(rows, COLUMNS))[0].acronym, 'ARISTOTLE');
});

test('validateRows: actionable errors; several trials per note allowed', () => {
  const ok = validateRows([
    { action: 'create_or_link', note_id: N1, acronym: 'DEFUSE 3', year: '2018', new_type: 'Review', user_id: U },
    { action: 'create_or_link', note_id: N1, acronym: 'DAWN', year: '', new_type: 'review', user_id: U },
    { action: 'skip', note_id: N2, acronym: '', user_id: U },
  ]);
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.rows.map((r) => [r.acronym, r.year, r.new_type]), [
    ['DEFUSE 3', 2018, 'review'],
    ['DAWN', null, 'review'],
    ['', null, ''],
  ]);

  const { errors } = validateRows([
    { action: 'create_or_link', note_id: N1, acronym: '', new_type: 'review', user_id: U },
    { action: 'create_or_link', note_id: N1, acronym: 'X', year: '20x1', new_type: 'review', user_id: U },
    { action: 'create_or_link', note_id: N2, acronym: 'Y', new_type: 'trial', user_id: U },
    { action: 'maybe', note_id: 'nope', user_id: U },
    { action: 'create_or_link', note_id: N1, acronym: 'x', year: '', new_type: 'case', user_id: U },
    { action: 'create_or_link', note_id: N1, acronym: 'X', year: '', new_type: 'review', user_id: U },
  ]);
  const all = errors.join('\n');
  assert.match(all, /row 2 .*needs an acronym/);
  assert.match(all, /row 3 .*year must be blank or a year/);
  assert.match(all, /row 4 .*new_type must be one of question, article, review, case, other/);
  assert.match(all, /row 5 .*note_id is not a UUID/);
  assert.match(all, /row 5 .*action must be create_or_link or skip/);
  assert.match(all, /row 6 .*new_type differs from row 2/);
  assert.match(all, /row 7 .*same note and trial as row 6/);
});

test('buildApplySql: dry run by default, quoted values, never deletes', () => {
  const { rows } = validateRows([
    { action: 'create_or_link', note_id: N1, acronym: "O'TRIAL", year: '2011', new_type: 'review', user_id: U, title: 'x' },
    { action: 'skip', note_id: N2, user_id: U, title: "Averroes' note" },
  ]);
  const sql = buildApplySql(rows);
  assert.match(sql, /'O''TRIAL', 2011, 'review'\)/);
  assert.match(sql, /INSERT INTO tn_skip VALUES\n  \('8f6c8e93[^']*'::uuid, 'Averroes'' note'\);/);
  assert.match(sql, /'cites'/);
  assert.match(sql, /WHERE n\.id = x\.note_id AND n\.content_type = 'trial'/);
  assert.match(sql, /ROLLBACK;  -- dry run/);
  assert.match(buildApplySql(rows, { commit: true }), /\nCOMMIT;\n$/);
  assert.ok(!/\bDELETE\b/i.test(sql));
  assert.ok(!/content_type\s*=\s*'trial'\s*,|ALTER TABLE/i.test(sql));
});
