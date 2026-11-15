import { buildTopicGraph } from './topicTree';
import { noteSpecialty, primaryTopicId, rootTopicByName, rootTopicId } from './specialty';

const t = (id: string, name: string) => ({ id, name, aliases: [] as string[] });
const graph = buildTopicGraph(
  [t('neuro', 'Neurology'), t('cv', 'Cerebrovascular'), t('ncc', 'Neurocritical care'), t('pres', 'PRES'), t('cards', 'Cardiology'), t('icu', 'Critical care')],
  [
    { parent_id: 'neuro', child_id: 'cv' },
    { parent_id: 'neuro', child_id: 'ncc' },
    { parent_id: 'cv', child_id: 'pres' },
    { parent_id: 'ncc', child_id: 'pres' },
    { parent_id: 'icu', child_id: 'ncc' },
  ]
);

describe('primaryTopicId', () => {
  test('prefers the primary link, else the first', () => {
    expect(primaryTopicId([{ topic_id: 'a', is_primary: false }, { topic_id: 'b', is_primary: true }])).toBe('b');
    expect(primaryTopicId([{ topic_id: 'a', is_primary: false }])).toBe('a');
    expect(primaryTopicId([])).toBeUndefined();
    expect(primaryTopicId(undefined)).toBeUndefined();
  });
});

describe('rootTopicId', () => {
  test('a root is its own root', () => {
    expect(rootTopicId(graph, 'cards')).toBe('cards');
  });
  test('uses the first ancestor path when there are several', () => {
    // paths sorted by name: Critical care/… before Neurology/…
    expect(rootTopicId(graph, 'pres')).toBe('icu');
    expect(rootTopicId(graph, 'cv')).toBe('neuro');
  });
  test('unknown topic', () => {
    expect(rootTopicId(graph, 'missing')).toBeUndefined();
  });
});

describe('noteSpecialty', () => {
  test('is the root of the primary topic', () => {
    expect(noteSpecialty(graph, { note_topics: [{ topic_id: 'cv', is_primary: true }] })).toEqual({
      name: 'Neurology',
      topicId: 'neuro',
    });
  });
  test('null without topics', () => {
    expect(noteSpecialty(graph, { note_topics: [] })).toBeNull();
    expect(noteSpecialty(graph, {})).toBeNull();
  });
  test('null while the topic is not loaded yet', () => {
    expect(noteSpecialty(graph, { note_topics: [{ topic_id: 'missing', is_primary: true }] })).toBeNull();
  });
});

describe('rootTopicByName', () => {
  test('matches root names ignoring case and spacing', () => {
    expect(rootTopicByName(graph, 'neurology')).toBe('neuro');
    expect(rootTopicByName(graph, '  NEUROLOGY ')).toBe('neuro');
  });
  test('ignores non-root topics and unknown names', () => {
    expect(rootTopicByName(graph, 'Cerebrovascular')).toBeUndefined();
    expect(rootTopicByName(graph, 'Dermatology')).toBeUndefined();
    expect(rootTopicByName(graph, '')).toBeUndefined();
  });
});
