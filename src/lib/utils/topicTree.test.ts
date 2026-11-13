import {
  ancestorPaths,
  buildTopicGraph,
  descendantIds,
  expandKeysFor,
  findTopicByName,
  flattenTree,
  matchTopics,
  wouldCreateCycle,
} from './topicTree';

const t = (id: string, name: string, aliases: string[] = []) => ({ id, name, aliases });

const topics = [
  t('neuro', 'Neurology'),
  t('cv', 'Cerebrovascular'),
  t('ncc', 'Neurocritical care'),
  t('svd', 'Small vessel disease'),
  t('bad', 'Branch atheromatous disease', ['BAD']),
  t('pres', 'PRES', ['RPLS', 'Posterior reversible encephalopathy syndrome']),
  t('loose', 'Loose topic'),
];

const edges = [
  { parent_id: 'neuro', child_id: 'cv' },
  { parent_id: 'neuro', child_id: 'ncc' },
  { parent_id: 'cv', child_id: 'svd' },
  { parent_id: 'svd', child_id: 'bad' },
  { parent_id: 'cv', child_id: 'pres' },
  { parent_id: 'ncc', child_id: 'pres' },
];

const graph = buildTopicGraph(topics, edges);

describe('buildTopicGraph', () => {
  test('roots are topics without parents, sorted by name', () => {
    expect(graph.roots).toEqual(['loose', 'neuro']);
  });

  test('a topic can have two parents', () => {
    expect(graph.parents.get('pres')).toEqual(['cv', 'ncc']);
  });

  test('ignores edges to unknown topics', () => {
    const g = buildTopicGraph(topics, [...edges, { parent_id: 'cv', child_id: 'missing' }]);
    expect(g.children.get('cv')).toEqual(['pres', 'svd']);
  });
});

describe('ancestorPaths', () => {
  test('PRES has one path per parent', () => {
    expect(ancestorPaths(graph, 'pres')).toEqual([
      ['neuro', 'cv', 'pres'],
      ['neuro', 'ncc', 'pres'],
    ]);
  });

  test('a root is its own path', () => {
    expect(ancestorPaths(graph, 'neuro')).toEqual([['neuro']]);
  });
});

describe('descendantIds / wouldCreateCycle', () => {
  test('Cerebrovascular includes PRES and nested subtopics', () => {
    expect([...descendantIds(graph, 'cv')].sort()).toEqual(['bad', 'cv', 'pres', 'svd']);
  });

  test('placing a topic under its own descendant is a cycle', () => {
    expect(wouldCreateCycle(graph, 'bad', 'neuro')).toBe(true);
    expect(wouldCreateCycle(graph, 'cv', 'cv')).toBe(true);
    expect(wouldCreateCycle(graph, 'loose', 'pres')).toBe(false);
  });
});

describe('matchTopics', () => {
  test('RPLS finds PRES through its alias', () => {
    const [first] = matchTopics(topics, 'rpls');
    expect(first.topic.id).toBe('pres');
    expect(first.matchedAlias).toBe('RPLS');
    expect(first.rank).toBe(1);
  });

  test('exact name beats prefix, prefix beats substring', () => {
    expect(matchTopics(topics, 'pres').map((m) => m.topic.id)).toEqual(['pres']);
    expect(matchTopics(topics, 'neuro').map((m) => m.topic.id)).toEqual(['ncc', 'neuro']);
    expect(matchTopics(topics, 'disease').map((m) => m.topic.id)).toEqual(['bad', 'svd']);
  });

  test('blank query matches nothing', () => {
    expect(matchTopics(topics, '   ')).toEqual([]);
  });
});

describe('findTopicByName', () => {
  test('matches names and aliases ignoring case and spacing', () => {
    expect(findTopicByName(topics, '  pres ')?.id).toBe('pres');
    expect(findTopicByName(topics, 'bad')?.id).toBe('bad');
    expect(findTopicByName(topics, 'stroke')).toBeUndefined();
  });
});

describe('flattenTree', () => {
  test('shows roots collapsed by default', () => {
    expect(flattenTree(graph, new Set()).map((r) => r.id)).toEqual(['loose', 'neuro']);
  });

  test('a multi-parent topic appears under each expanded parent', () => {
    const rows = flattenTree(graph, new Set(['neuro', 'neuro/cv', 'neuro/ncc']));
    const pres = rows.filter((r) => r.id === 'pres');
    expect(pres.map((r) => r.key)).toEqual(['neuro/cv/pres', 'neuro/ncc/pres']);
    expect(pres.every((r) => r.multiParent)).toBe(true);
    expect(rows.find((r) => r.id === 'svd')).toMatchObject({ depth: 2, hasChildren: true, expanded: false });
  });

  test('expandKeysFor reveals every occurrence of a topic', () => {
    const rows = flattenTree(graph, new Set(expandKeysFor(graph, 'pres')));
    expect(rows.filter((r) => r.id === 'pres')).toHaveLength(2);
  });
});
