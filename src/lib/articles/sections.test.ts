import { capSections, parseJatsSections, splitPdfSections } from './sections';

const JATS = `<article><front><article-meta>
<abstract><sec><title>BACKGROUND</title><p>Whether drug A works is unknown.</p></sec>
<sec><title>RESULTS</title><p>Events: 5.0% vs 6.5%.</p></sec></abstract>
<abstract abstract-type="graphical"><p>Graphical.</p></abstract>
</article-meta></front>
<body><p>Lead paragraph.</p>
<sec id="S1"><title>METHODS</title><p>We enrolled 4881 adults.<xref ref-type="bibr" rid="R12">12</xref></p>
  <sec id="S1a"><title>Trial Population</title><p>Adults within 12&#x00a0;h &amp; older than 40.</p></sec>
  <sec id="S1b"><title>Outcomes</title><p>Major ischemic events at 90 days.</p></sec>
</sec>
<sec id="S2"><title>RESULTS</title><p>HR 0.75 (95% CI, 0.59&#x2013;0.95).</p></sec>
<sec id="S3"><title>Supplementary Material</title><supplementary-material><p>Appendix</p></supplementary-material></sec>
</body>
<back><ref-list><ref><p>Smith 2010.</p></ref></ref-list></back>
<floats-group><table-wrap id="T1"><label>Table 1.</label><caption><p>Baseline.</p></caption>
<table><thead><tr><th>Characteristic</th><th>Drug A (N = 2432)</th></tr></thead>
<tbody><tr><td>Median age</td><td>65.0</td></tr></tbody></table>
<table-wrap-foot><fn><p>Footnote 99.</p></fn></table-wrap-foot></table-wrap></floats-group>
</article>`;

describe('parseJatsSections', () => {
  it('builds abstract, body (with nested ids) and table sections', () => {
    const sections = parseJatsSections(JATS);
    expect(sections.map((s) => [s.id, s.heading])).toEqual([
      ['abstract', 'Abstract'],
      ['s0', 'Introduction'],
      ['s1', 'METHODS'],
      ['s1.1', 'Trial Population'],
      ['s1.2', 'Outcomes'],
      ['s2', 'RESULTS'],
      ['t1', 'Table 1. Baseline.'],
    ]);
  });

  it('cleans text: entities, no citation numbers, tables as rows, no footnotes', () => {
    const byId = Object.fromEntries(parseJatsSections(JATS).map((s) => [s.id, s.text]));
    expect(byId.abstract).toBe('BACKGROUND: Whether drug A works is unknown.\nRESULTS: Events: 5.0% vs 6.5%.');
    expect(byId.s1).toBe('We enrolled 4881 adults.');
    expect(byId['s1.1']).toBe('Adults within 12 h & older than 40.');
    expect(byId.s2).toBe('HR 0.75 (95% CI, 0.59–0.95).');
    expect(byId.t1).toBe('Baseline.\nCharacteristic | Drug A (N = 2432)\nMedian age | 65.0');
  });

  it('returns nothing when PMC withholds the body', () => {
    expect(parseJatsSections(JATS.replace(/<body>[\s\S]*<\/body>/, ''))).toEqual([]);
  });
});

describe('splitPdfSections', () => {
  const page1 = [
    'Example Journal 2020',
    'Drug A versus Placebo',
    'ABSTRACT',
    'We randomly assigned 1,000 adults. Events occurred in 5.0% vs',
    '6.5% (HR 0.75).',
    '1. Introduction',
    'Example disease is com-',
    'mon in adults.',
    '1',
  ].join('\n');
  const page2 = ['Example Journal 2020', '2. Methods', 'A double-blind trial.', 'Results', 'HR 0.75.', '2'].join('\n');
  const page3 = [
    'Example Journal 2020',
    'Acknowledgments',
    'We thank 12 people.',
    'Discussion',
    'Bleeding rose.',
    'References',
    '1. Smith 2010;362:1-10.',
  ].join('\n');

  it('splits at headings, joins lines, drops running heads, page numbers, acknowledgements and references', () => {
    expect(splitPdfSections([page1, page2, page3])).toEqual([
      { id: 's0', heading: 'Opening', text: 'Drug A versus Placebo' },
      { id: 's1', heading: 'Abstract', text: 'We randomly assigned 1,000 adults. Events occurred in 5.0% vs 6.5% (HR 0.75).' },
      { id: 's2', heading: 'Introduction', text: 'Example disease is com-mon in adults.' },
      { id: 's3', heading: 'Methods', text: 'A double-blind trial.' },
      { id: 's4', heading: 'Results', text: 'HR 0.75.' },
      { id: 's5', heading: 'Discussion', text: 'Bleeding rose.' },
    ]);
  });

  it('falls back to pages without headings', () => {
    expect(splitPdfSections(['Some text here.', 'More text.']).map((s) => s.id)).toEqual(['p1', 'p2']);
  });
});

describe('capSections', () => {
  it('cuts at the character budget', () => {
    const s = [
      { id: 'a', heading: 'A', text: '12345' },
      { id: 'b', heading: 'B', text: '67890' },
      { id: 'c', heading: 'C', text: 'xx' },
    ];
    expect(capSections(s, 7).map((x) => x.text)).toEqual(['12345', '67']);
  });
});
