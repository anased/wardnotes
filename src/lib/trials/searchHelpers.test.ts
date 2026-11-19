import { normalizeAcronym, parseStudy, registryStudyMatches, registryTerm } from './clinicaltrials';
import { backoffMs, ncbiMinIntervalMs, parseSummary } from './ncbi';
import { pubmedGroupTerm, pubmedNameTerm, searchCacheKey } from './searchTrials';
import { validateJson } from '@/lib/ai/providers';
import { ExtractedTrialSchema } from './extractTrial';

jest.mock('@/lib/ai/claude', () => ({}));

describe('search terms', () => {
  it('builds the PubMed name and investigator-group terms', () => {
    expect(pubmedNameTerm('CHANCE-2')).toBe(
      '"CHANCE-2"[Title/Abstract] AND (randomized controlled trial[pt] OR clinical trial[pt])'
    );
    expect(pubmedGroupTerm('say "hi"')).toBe(
      '"say hi"[Corporate Author] AND (randomized controlled trial[pt] OR clinical trial[pt])'
    );
  });

  it('builds the registry term with separator variants and, for long names, the official title', () => {
    expect(registryTerm('CSPS.com')).toBe('AREA[Acronym]"CSPS.com" OR AREA[Acronym]"CSPS com"');
    expect(registryTerm('POINT')).toBe('AREA[Acronym]"POINT"');
    expect(registryTerm('Platelet Oriented Inhibition')).toBe(
      'AREA[Acronym]"Platelet Oriented Inhibition" OR AREA[OfficialTitle]"Platelet Oriented Inhibition"'
    );
  });

  it('normalizes cache keys', () => {
    expect(searchCacheKey('name', '  Chance-2  ')).toBe('name:chance-2');
    expect(searchCacheKey('name', 'NAVIGATE   ESUS')).toBe('name:navigate esus');
    expect(searchCacheKey('nct', 'nct00991029')).toBe('nct:NCT00991029');
  });
});

describe('registry matching', () => {
  const study = (acronym: string | null, officialTitle: string | null = null) => ({
    nctId: 'NCT1',
    acronym,
    officialTitle,
    briefTitle: null,
    resultPmids: [],
  });

  it('matches acronyms ignoring case and separators (including the Japanese middle dot)', () => {
    expect(normalizeAcronym('CSPS・com')).toBe(normalizeAcronym('CSPS.com'));
    expect(registryStudyMatches(study('CHANCE 2'), 'chance-2')).toBe(true);
    expect(registryStudyMatches(study('POINT-HD'), 'POINT')).toBe(false);
  });

  it('matches long names against the official title', () => {
    const s = study('POINT', 'Platelet-Oriented Inhibition in New TIA and Minor Ischemic Stroke (POINT) Trial');
    expect(registryStudyMatches(s, 'Platelet-Oriented Inhibition in New TIA')).toBe(true);
    expect(registryStudyMatches(study(null, 'Some Point Of Care Study'), 'Point')).toBe(false);
  });

  it('parses registry results references', () => {
    expect(
      parseStudy({
        protocolSection: {
          identificationModule: { nctId: 'NCT02313909', acronym: 'NAVIGATE ESUS' },
          referencesModule: {
            references: [
              { pmid: '29766772', type: 'RESULT' },
              { pmid: '1', type: 'BACKGROUND' },
              { type: 'RESULT' },
            ],
          },
        },
      })
    ).toEqual({ nctId: 'NCT02313909', acronym: 'NAVIGATE ESUS', officialTitle: null, briefTitle: null, resultPmids: ['29766772'] });
  });
});

describe('NCBI helpers', () => {
  it('spaces requests under 3/s without a key and 10/s with one', () => {
    expect(1000 / ncbiMinIntervalMs(false)).toBeLessThan(3);
    expect(1000 / ncbiMinIntervalMs(true)).toBeLessThan(10);
  });

  it('backs off exponentially, honouring Retry-After', () => {
    expect([1, 2, 3].map((a) => backoffMs(a, null))).toEqual([500, 1000, 2000]);
    expect(backoffMs(1, '2')).toBe(2000);
    expect(backoffMs(1, '600')).toBe(10_000);
  });

  it('parses an ESummary record', () => {
    expect(
      parseSummary('29766750', {
        title: 'Clopidogrel and Aspirin in <i>Acute</i> Ischemic Stroke and High-Risk TIA.',
        source: 'N Engl J Med',
        fulljournalname: 'The New England journal of medicine',
        pubdate: '2018 Jul 19',
        authors: [
          { name: 'Johnston SC', authtype: 'Author' },
          { name: 'POINT Investigators', authtype: 'CollectiveName' },
        ],
        pubtype: ['Journal Article', 'Randomized Controlled Trial'],
        articleids: [{ idtype: 'doi', value: '10.1056/NEJMoa1800410' }],
        references: [{ reftype: 'Comment in' }, { reftype: 'Comment in' }, { reftype: 'Erratum in' }],
      })
    ).toEqual({
      pmid: '29766750',
      title: 'Clopidogrel and Aspirin in Acute Ischemic Stroke and High-Risk TIA',
      journal: 'The New England journal of medicine',
      journalAbbrev: 'N Engl J Med',
      year: 2018,
      firstAuthor: 'Johnston SC',
      doi: '10.1056/NEJMoa1800410',
      pubTypes: ['Journal Article', 'Randomized Controlled Trial'],
      commentCount: 2,
    });
    expect(parseSummary('1', { error: 'cannot get document summary' })).toBeNull();
  });
});

describe('validateJson (extraction output)', () => {
  const valid = {
    is_clinical_trial: true,
    acronym: 'POINT',
    full_name: null,
    year: 2018,
    population: null,
    intervention: null,
    comparator: null,
    result: null,
    notes: null,
  };

  it('accepts output matching the trial schema', () => {
    expect(validateJson(ExtractedTrialSchema, JSON.stringify(valid))).toEqual({ ok: true, data: valid });
  });

  it('rejects invalid JSON and schema mismatches', () => {
    expect(validateJson(ExtractedTrialSchema, '{"is_clinical_trial": tru').ok).toBe(false);
    const bad = validateJson(ExtractedTrialSchema, JSON.stringify({ ...valid, year: '2018' }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.detail).toMatch(/year/);
  });
});
