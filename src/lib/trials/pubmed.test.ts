import { MIN_PASTED_ABSTRACT_LENGTH, parsePubmedXml, parseTrialIdentifier } from './pubmed';

describe('parseTrialIdentifier', () => {
  it.each([
    ['29766750', { kind: 'pmid', value: '29766750' }],
    ['  PMID: 29766750 ', { kind: 'pmid', value: '29766750' }],
    ['pmid29766750', { kind: 'pmid', value: '29766750' }],
    ['https://pubmed.ncbi.nlm.nih.gov/29766750/', { kind: 'pmid', value: '29766750' }],
    ['https://www.ncbi.nlm.nih.gov/pubmed/29766750?dopt=Abstract', { kind: 'pmid', value: '29766750' }],
    ['10.1056/NEJMoa1800410', { kind: 'doi', value: '10.1056/NEJMoa1800410' }],
    ['doi:10.1056/NEJMoa1800410.', { kind: 'doi', value: '10.1056/NEJMoa1800410' }],
    ['https://doi.org/10.1056/NEJMoa1800410', { kind: 'doi', value: '10.1056/NEJMoa1800410' }],
    [
      'https://www.nejm.org/doi/full/10.1056/NEJMoa1800410?query=TOC#article',
      { kind: 'doi', value: '10.1056/NEJMoa1800410' },
    ],
    [
      'https://www.thelancet.com/journals/lancet/article/PIIS0140-6736(20)30000-0/fulltext%20',
      null, // no DOI or PMID in the link
    ],
    ['https://doi.org/10.1016%2FS0140-6736(19)32499-0', { kind: 'doi', value: '10.1016/S0140-6736(19)32499-0' }],
    ['PMC6097526', { kind: 'pmcid', value: 'PMC6097526' }],
    ['https://pmc.ncbi.nlm.nih.gov/articles/PMC6097526/', { kind: 'pmcid', value: 'PMC6097526' }],
    ['', null],
    ['not an identifier', null],
  ])('%s', (input, expected) => {
    expect(parseTrialIdentifier(input)).toEqual(expected);
  });

  it('treats long free text as a pasted abstract', () => {
    const abstract = 'BACKGROUND: Something about a trial with 10.1056/fake numbers. '.repeat(5);
    expect(abstract.length).toBeGreaterThanOrEqual(MIN_PASTED_ABSTRACT_LENGTH);
    expect(parseTrialIdentifier(abstract)).toEqual({ kind: 'text', value: abstract.trim() });
  });
});

// Synthetic record (fictional trial) following the PubMed efetch XML structure.
const FIXTURE = `<?xml version="1.0" ?>
<!DOCTYPE PubmedArticleSet PUBLIC "-//NLM//DTD PubMedArticle, 1st January 2025//EN" "https://dtd.nlm.nih.gov/ncbi/pubmed/out/pubmed_250101.dtd">
<PubmedArticleSet>
<PubmedArticle>
  <MedlineCitation Status="MEDLINE" Owner="NLM">
    <PMID Version="1">12345678</PMID>
    <Article PubModel="Print-Electronic">
      <Journal>
        <ISSN IssnType="Electronic">1533-4406</ISSN>
        <JournalIssue CitedMedium="Internet">
          <Volume>379</Volume>
          <Issue>3</Issue>
          <PubDate><Year>2018</Year><Month>Jul</Month><Day>19</Day></PubDate>
        </JournalIssue>
        <Title>The New England journal of medicine</Title>
        <ISOAbbreviation>N Engl J Med</ISOAbbreviation>
      </Journal>
      <ArticleTitle>Drug A and Drug B in Example Disease: the <i>EXAMPLE</i> Trial.</ArticleTitle>
      <ELocationID EIdType="doi" ValidYN="Y">10.1000/example.2018.001</ELocationID>
      <PublicationTypeList>
        <PublicationType UI="D016428">Journal Article</PublicationType>
        <PublicationType UI="D016449">Randomized Controlled Trial</PublicationType>
      </PublicationTypeList>
      <Abstract>
        <AbstractText Label="BACKGROUND" NlmCategory="BACKGROUND">Whether drug A &amp; drug B reduce events is unknown.</AbstractText>
        <AbstractText Label="METHODS" NlmCategory="METHODS">We randomly assigned 1,000 adults (age &#x2265;18 years) within 12&#160;h.</AbstractText>
        <AbstractText Label="RESULTS" NlmCategory="RESULTS">Events occurred in 5.0% vs 6.5% (HR 0.75; 95% CI, 0.59 to 0.95; P=0.02); CO<sub>2</sub> levels &lt;40.</AbstractText>
        <AbstractText/>
        <CopyrightInformation>Copyright © 2018.</CopyrightInformation>
      </Abstract>
      <AuthorList CompleteYN="Y">
        <Author ValidYN="Y"><LastName>Example</LastName><ForeName>Ann</ForeName></Author>
      </AuthorList>
      <ArticleDate DateType="Electronic"><Year>2018</Year><Month>05</Month><Day>16</Day></ArticleDate>
    </Article>
    <OtherAbstract Type="Publisher" Language="spa"><AbstractText>Resumen en espa&#241;ol.</AbstractText></OtherAbstract>
  </MedlineCitation>
  <PubmedData>
    <ArticleIdList>
      <ArticleId IdType="pubmed">12345678</ArticleId>
      <ArticleId IdType="doi">10.1000/example.2018.001</ArticleId>
      <ArticleId IdType="pmc">PMC1234567</ArticleId>
    </ArticleIdList>
    <ReferenceList>
      <Reference><Citation>Other paper.</Citation>
        <ArticleIdList><ArticleId IdType="doi">10.9999/wrong.reference</ArticleId><ArticleId IdType="pmc">PMC9999999</ArticleId></ArticleIdList>
      </Reference>
    </ReferenceList>
  </PubmedData>
</PubmedArticle>
</PubmedArticleSet>`;

describe('parsePubmedXml', () => {
  it('extracts the article fields', () => {
    expect(parsePubmedXml(FIXTURE)).toEqual({
      pmid: '12345678',
      title: 'Drug A and Drug B in Example Disease: the EXAMPLE Trial.',
      journal: 'The New England journal of medicine',
      year: 2018,
      doi: '10.1000/example.2018.001',
      pmcid: 'PMC1234567',
      publicationTypes: ['Journal Article', 'Randomized Controlled Trial'],
      abstract: [
        'BACKGROUND: Whether drug A & drug B reduce events is unknown.',
        'METHODS: We randomly assigned 1,000 adults (age ≥18 years) within 12 h.',
        'RESULTS: Events occurred in 5.0% vs 6.5% (HR 0.75; 95% CI, 0.59 to 0.95; P=0.02); CO2 levels <40.',
      ].join('\n\n'),
    });
  });

  it('uses the DOI from PubmedData when there is no ELocationID, never a reference DOI', () => {
    const xml = FIXTURE.replace(/<ELocationID[\s\S]*?<\/ELocationID>/, '');
    expect(parsePubmedXml(xml)?.doi).toBe('10.1000/example.2018.001');

    const noOwnDoi = xml.replace('<ArticleId IdType="doi">10.1000/example.2018.001</ArticleId>', '');
    expect(parsePubmedXml(noOwnDoi)?.doi).toBeNull();
  });

  it('reads the year from MedlineDate, then ArticleDate', () => {
    const medline = FIXTURE.replace(
      /<PubDate>[\s\S]*?<\/PubDate>/,
      '<PubDate><MedlineDate>2019 Nov-Dec</MedlineDate></PubDate>'
    );
    expect(parsePubmedXml(medline)?.year).toBe(2019);

    const noPubYear = FIXTURE.replace(/<PubDate>[\s\S]*?<\/PubDate>/, '<PubDate><Season>Spring</Season></PubDate>');
    expect(parsePubmedXml(noPubYear)?.year).toBe(2018);
  });

  it('has no PMC ID or publication types when the record lists none, never a reference PMC ID', () => {
    const xml = FIXTURE.replace('<ArticleId IdType="pmc">PMC1234567</ArticleId>', '').replace(
      /<PublicationTypeList>[\s\S]*?<\/PublicationTypeList>/,
      ''
    );
    const article = parsePubmedXml(xml);
    expect(article?.pmcid).toBeNull();
    expect(article?.publicationTypes).toEqual([]);
  });

  it('returns an empty abstract when PubMed has none', () => {
    const xml = FIXTURE.replace(/<Abstract>[\s\S]*?<\/Abstract>/, '');
    expect(parsePubmedXml(xml)?.abstract).toBe('');
  });

  it('returns null when there is no article', () => {
    expect(parsePubmedXml('<?xml version="1.0" ?><PubmedArticleSet></PubmedArticleSet>')).toBeNull();
  });
});
