import { isSecondary, rankCandidates, scoreCandidate, titleMentionsAcronym, type CandidateInput } from './rankCandidates';

const NOW = 2026;

function paper(overrides: Partial<CandidateInput> & { pmid: string; title: string }): CandidateInput {
  return {
    journal: null,
    journalAbbrev: 'Stroke',
    year: 2020,
    firstAuthor: 'Doe J',
    doi: null,
    pubTypes: ['Journal Article', 'Randomized Controlled Trial'],
    commentCount: 0,
    pubmedRank: null,
    corporateAuthor: false,
    nctIds: [],
    registryLinked: false,
    registryResult: false,
    ...overrides,
  };
}

describe('titleMentionsAcronym', () => {
  it.each([
    ['Blood-pressure targets in patients with recent lacunar stroke: the SPS3 randomised trial', 'SPS3', true],
    ['Outcomes in the CHANCE 2 trial', 'CHANCE-2', true],
    ['Outcomes in the CHANCE-2 trial', 'chance 2', true],
    ['Outcomes in the CHANCE-2 trial', 'CHANCE', false], // whole token only
    ['Outcomes in the CHANCE-2 trial', 'CHANCE-3', false],
    ['Subanalysis of the CSPS.com trial', 'CSPS.com', true],
    ['Subanalysis of the CSPS.com trial', 'csps.com', true],
    ['Effectiveness of Point-of-Care Troponin Testing', 'POINT', false], // title case, not an acronym
    ['testing at the point of care', 'POINT', false],
    ['Results of the POINT trial', 'point', true],
    ['NAVIGATE ESUS: rivaroxaban vs aspirin', 'NAVIGATE ESUS', true],
    ['NAVIGATE-ESUS: rivaroxaban vs aspirin', 'NAVIGATE ESUS', true],
  ])('%s / %s -> %s', (title, query, expected) => {
    expect(titleMentionsAcronym(title, query)).toBe(expected);
  });
});

describe('isSecondary', () => {
  it.each([
    ['A Post Hoc Analysis of the THALES Randomized Clinical Trial', [], true],
    ['Efficacy in Patients With Moderate Stroke: A Secondary Analysis of THALES', [], true],
    ['Rationale and design of the ELAN trial', [], true],
    ['Characterization of Patients in the NAVIGATE ESUS Trial', [], true],
    ['Clopidogrel and Aspirin in Acute Ischemic Stroke and High-Risk TIA', ['Randomized Controlled Trial'], false],
    ['Apixaban to Prevent Recurrence After Cryptogenic Stroke: The ARCADIA Randomized Clinical Trial', [], false],
    ['DAPT after minor stroke', ['Comment'], true],
    ['DAPT after minor stroke', ['Editorial'], true],
    ['DAPT after minor stroke', ['Clinical Trial Protocol'], true],
  ])('%s', (title, types, expected) => {
    expect(isSecondary(title, types)).toBe(expected);
  });
});

describe('scoreCandidate', () => {
  it('reports how the paper names the trial', () => {
    expect(scoreCandidate(paper({ pmid: '1', title: 'The FOO trial' }), 'FOO', NOW).acronymMatch).toBe('title');
    expect(scoreCandidate(paper({ pmid: '1', title: 'x', registryLinked: true, nctIds: ['NCT1'] }), 'FOO', NOW).acronymMatch).toBe('registry');
    expect(scoreCandidate(paper({ pmid: '1', title: 'x', corporateAuthor: true }), 'FOO', NOW).acronymMatch).toBe('author');
    expect(scoreCandidate(paper({ pmid: '1', title: 'x' }), 'FOO', NOW).acronymMatch).toBeNull();
  });

  it('treats an investigator-entered registry reference as weaker than a PubMed [si] link', () => {
    const ref = scoreCandidate(paper({ pmid: '1', title: 'x', registryResult: true, nctIds: ['NCT1'] }), 'FOO', NOW);
    expect(ref.acronymMatch).toBeNull();
  });

  it('recognises "Randomized Clinical Trial" in the title before PubMed indexes the publication type', () => {
    const c = scoreCandidate(
      paper({ pmid: '1', title: 'Apixaban After Cryptogenic Stroke: The ARCADIA Randomized Clinical Trial', pubTypes: ['Journal Article'] }),
      'ARCADIA',
      NOW
    );
    expect(c.isRct).toBe(true);
  });
});

describe('rankCandidates', () => {
  it('ranks the primary NEJM paper (no acronym in title) above secondary analyses that name the trial', () => {
    const ranked = rankCandidates(
      [
        paper({
          pmid: 'secondary',
          title: 'Efficacy and Safety of Ticagrelor in Moderate Stroke: A Secondary Analysis of the THALES Trial',
          journalAbbrev: 'JAMA Neurol',
          year: 2021,
          pubmedRank: 0,
        }),
        paper({
          pmid: 'primary',
          title: 'Ticagrelor and Aspirin or Aspirin Alone in Acute Ischemic Stroke or TIA',
          journalAbbrev: 'N Engl J Med',
          commentCount: 3,
          registryLinked: true,
          nctIds: ['NCT03354429'],
        }),
        paper({
          pmid: 'other',
          title: 'Vulnerable States After Cerebral Ischemic Events: Insights From THALES',
          pubTypes: ['Journal Article'],
          year: 2023,
          pubmedRank: 1,
        }),
      ],
      'THALES',
      NOW
    );
    expect(ranked.map((c) => c.pmid)).toEqual(['primary', 'secondary', 'other']);
    expect(ranked[1].secondary).toBe(true);
  });

  it('prefers an RCT over a non-trial publication that names the trial', () => {
    const ranked = rankCandidates(
      [
        paper({ pmid: 'cohort', title: 'The FOO cohort revisited', pubTypes: ['Journal Article'], journalAbbrev: 'Lancet' }),
        paper({ pmid: 'rct', title: 'FOO: a randomised trial of X vs Y', journalAbbrev: 'BMJ' }),
      ],
      'FOO',
      NOW
    );
    expect(ranked[0].pmid).toBe('rct');
  });

  it('uses journal prominence, then recency, to break ties between otherwise equal papers', () => {
    const ranked = rankCandidates(
      [
        paper({ pmid: 'old', title: 'The FOO trial', journalAbbrev: 'Stroke', year: 2001 }),
        paper({ pmid: 'nejm', title: 'The FOO trial', journalAbbrev: 'N Engl J Med', year: 2001 }),
        paper({ pmid: 'new', title: 'The FOO trial', journalAbbrev: 'Stroke', year: 2021 }),
      ],
      'FOO',
      NOW
    );
    expect(ranked.map((c) => c.pmid)).toEqual(['nejm', 'new', 'old']);
  });

  it('dedupes by PMID and merges registry links and search ranks', () => {
    const ranked = rankCandidates(
      [
        paper({ pmid: '42', title: 'x', pubmedRank: 3 }),
        paper({ pmid: '42', title: 'x', registryLinked: true, nctIds: ['NCT1'], pubmedRank: null }),
        paper({ pmid: '42', title: 'x', nctIds: ['NCT2'], registryResult: true, pubmedRank: 1 }),
      ],
      'FOO',
      NOW
    );
    expect(ranked).toHaveLength(1);
    expect(ranked[0].nctIds).toEqual(['NCT1', 'NCT2']);
    expect(ranked[0].acronymMatch).toBe('registry');
  });

  it('does not reward a common word that merely appears in title case', () => {
    const ranked = rankCandidates(
      [
        paper({ pmid: 'poc', title: 'Effectiveness of Point-of-Care Troponin Testing', journalAbbrev: 'Ann Emerg Med', pubmedRank: 0 }),
        paper({
          pmid: 'point',
          title: 'Clopidogrel and Aspirin in Acute Ischemic Stroke and High-Risk TIA',
          journalAbbrev: 'N Engl J Med',
          commentCount: 5,
          registryLinked: true,
          nctIds: ['NCT00991029'],
        }),
      ],
      'POINT',
      NOW
    );
    expect(ranked[0].pmid).toBe('point');
    expect(ranked[1].acronymMatch).toBeNull();
  });
});
