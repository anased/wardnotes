import { classifyStudy } from './classify';

describe('classifyStudy', () => {
  it.each([
    [['Journal Article', 'Randomized Controlled Trial'], 'rct'],
    [['Clinical Trial, Phase III', 'Randomized Controlled Trial', 'Multicenter Study'], 'rct'],
    [['Clinical Trial, Phase II', 'Journal Article'], 'trial'],
    [['Meta-Analysis', 'Review', 'Systematic Review'], 'meta_analysis'],
    [['Systematic Review', 'Journal Article'], 'meta_analysis'],
    [['Practice Guideline', 'Review'], 'guideline'],
    [['Observational Study', 'Journal Article'], 'cohort'],
    [['Case Reports'], 'case'],
    [['Review', 'Journal Article'], 'review'],
    [['Journal Article'], 'other'],
    [[], 'other'],
  ])('%j -> %s', (types, kind) => {
    expect(classifyStudy(types)).toBe(kind);
  });
});
