import { MAX_NAME_QUERY_LENGTH, detectTrialQuery } from './identify';

describe('detectTrialQuery', () => {
  it.each([
    // Existing identifier flow is unchanged
    ['29766750', { kind: 'pmid', value: '29766750' }],
    ['PMID: 29766750', { kind: 'pmid', value: '29766750' }],
    ['https://pubmed.ncbi.nlm.nih.gov/29766750/', { kind: 'pmid', value: '29766750' }],
    ['10.1056/NEJMoa1800410', { kind: 'doi', value: '10.1056/NEJMoa1800410' }],
    ['https://doi.org/10.1056/NEJMoa1800410', { kind: 'doi', value: '10.1056/NEJMoa1800410' }],
    ['PMC6097526', { kind: 'pmcid', value: 'PMC6097526' }],
    // NCT numbers
    ['NCT00991029', { kind: 'nct', value: 'NCT00991029' }],
    ['nct00991029', { kind: 'nct', value: 'NCT00991029' }],
    ['  NCT 00991029 ', { kind: 'nct', value: 'NCT00991029' }],
    ['https://clinicaltrials.gov/study/NCT00991029', { kind: 'nct', value: 'NCT00991029' }],
    ['https://clinicaltrials.gov/ct2/show/NCT00991029?term=point', { kind: 'nct', value: 'NCT00991029' }],
    // Names / acronyms
    ['POINT', { kind: 'name', value: 'POINT' }],
    ['CHANCE-2', { kind: 'name', value: 'CHANCE-2' }],
    ['SPS3', { kind: 'name', value: 'SPS3' }],
    ['CSPS.com', { kind: 'name', value: 'CSPS.com' }],
    ['NAVIGATE   ESUS', { kind: 'name', value: 'NAVIGATE ESUS' }],
    ['ISIS-2', { kind: 'name', value: 'ISIS-2' }],
    ['Platelet-Oriented Inhibition in New TIA', { kind: 'name', value: 'Platelet-Oriented Inhibition in New TIA' }],
    // Not searchable
    ['', null],
    ['   ', null],
    ['12-34', null],
    ['https://www.thelancet.com/journals/lancet/article/PIIS0140-6736(20)30000-0/fulltext', null],
  ])('%j', (input, expected) => {
    expect(detectTrialQuery(input)).toEqual(expected);
  });

  it('NCT numbers need exactly 8 digits', () => {
    expect(detectTrialQuery('NCT0099102')).toEqual({ kind: 'name', value: 'NCT0099102' });
    expect(detectTrialQuery('NCT009910291')).toEqual({ kind: 'name', value: 'NCT009910291' });
  });

  it('treats a pasted abstract as text even if it mentions an NCT number or acronym', () => {
    const abstract = 'BACKGROUND: The POINT trial (NCT00991029) randomized patients with minor stroke. '.repeat(4);
    expect(detectTrialQuery(abstract)).toEqual({ kind: 'text', value: abstract.trim() });
  });

  it('does not treat medium-length prose as a name', () => {
    const text = 'a'.repeat(MAX_NAME_QUERY_LENGTH + 1);
    expect(detectTrialQuery(text)).toBeNull();
  });
});
