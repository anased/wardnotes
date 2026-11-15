import {
  findDuplicateTrial,
  matchTrials,
  parseTrialYear,
  supersedeCandidates,
  supersededTrials,
  trialLabel,
} from './trials';

const trial = (id: string, acronym: string, year: number | null, full_name: string | null = null, superseded_by: string | null = null) => ({
  id,
  acronym,
  year,
  full_name,
  superseded_by,
});

const trials = [
  trial('point', 'POINT', 2018, 'Platelet-Oriented Inhibition in New TIA and Minor Ischemic Stroke'),
  trial('chance', 'CHANCE', 2013, 'Clopidogrel in High-risk patients with Acute Non-disabling Cerebrovascular Events', 'chance2'),
  trial('chance2', 'CHANCE-2', 2021, null),
  trial('thales', 'THALES', 2020, 'Ticagrelor and aspirin or aspirin alone'),
];

test('trialLabel', () => {
  expect(trialLabel(trials[0])).toBe('POINT (2018)');
  expect(trialLabel({ acronym: 'X', year: null })).toBe('X');
});

describe('matchTrials', () => {
  test('exact acronym first, then prefix, then full name', () => {
    expect(matchTrials(trials, 'chance').map((t) => t.id)).toEqual(['chance', 'chance2']);
    expect(matchTrials(trials, 'ticagrelor').map((t) => t.id)).toEqual(['thales']);
    expect(matchTrials(trials, 'point').map((t) => t.id)).toEqual(['point']);
  });
});

describe('findDuplicateTrial', () => {
  test('same acronym and year, ignoring case', () => {
    expect(findDuplicateTrial(trials, 'point', 2018)?.id).toBe('point');
    expect(findDuplicateTrial(trials, 'POINT', 2019)).toBeUndefined();
    expect(findDuplicateTrial(trials, 'POINT', 2018, 'point')).toBeUndefined();
  });
});

describe('supersedeCandidates', () => {
  test('excludes the trial itself and anything that would form a loop', () => {
    // CHANCE is superseded by CHANCE-2, so CHANCE-2 can't be superseded by CHANCE
    expect(supersedeCandidates(trials, 'chance2').map((t) => t.id)).toEqual(['point', 'thales']);
    expect(supersedeCandidates(trials, 'point').map((t) => t.id)).toEqual(['chance', 'chance2', 'thales']);
  });

  test('a new trial may pick any', () => {
    expect(supersedeCandidates(trials, undefined)).toHaveLength(4);
  });
});

test('supersededTrials finds the trials a trial replaced', () => {
  expect(supersededTrials(trials, 'chance2').map((t) => t.id)).toEqual(['chance']);
});

test('parseTrialYear', () => {
  expect(parseTrialYear('')).toBeNull();
  expect(parseTrialYear(' 2018 ')).toBe(2018);
  expect(parseTrialYear('18')).toBeNaN();
  expect(parseTrialYear('2018.5')).toBeNaN();
});
