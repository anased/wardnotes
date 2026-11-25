import { dropUngroundedSentences, extractNumbers, isVerbatim, splitSentences, ungroundedNumbers } from './grounding';

const SOURCE =
  'We randomly assigned 4,881 adults within 12 h. Events occurred in 5.0% vs 6.5% ' +
  '(HR 0.75; 95% CI, 0.59 to 0.95; P=0.02). Mortality: 0·81 (0·70–0·94). n = 12 345.';

describe('extractNumbers', () => {
  it('reads thousands separators, decimals, mid-dot decimals and ranges', () => {
    expect(extractNumbers('4,881 and 12 345 and 0.59–0.95 and 0·81 and .5').map((n) => n.value)).toEqual([
      4881, 12345, 0.59, 0.95, 0.81, 0.5,
    ]);
  });

  it('does not join a list of small numbers into one', () => {
    expect(extractNumbers('arms 1,2 and 3').map((n) => n.value)).toEqual([1, 2, 3]);
  });
});

describe('ungroundedNumbers', () => {
  it('accepts numbers written differently but equal in value', () => {
    expect(ungroundedNumbers('4881 adults; 5% vs 6.50%; HR 0.75 (0.59–0.95); 0.81; 12,345', SOURCE)).toEqual([]);
  });

  it('flags numbers that are not in the source', () => {
    expect(ungroundedNumbers('An absolute risk reduction of 1.5% (NNT 67).', SOURCE)).toEqual(['1.5', '67']);
  });

  it('ignores the sign', () => {
    expect(ungroundedNumbers('a change of −0.75', SOURCE)).toEqual([]);
  });
});

describe('splitSentences', () => {
  it('does not split on decimals or "vs."', () => {
    expect(splitSentences('Events were 5.0% vs. 6.5%. The HR was 0.75. (Small trial.)')).toEqual([
      'Events were 5.0% vs. 6.5%.',
      'The HR was 0.75.',
      '(Small trial.)',
    ]);
  });
});

describe('dropUngroundedSentences', () => {
  it('keeps grounded sentences and drops the rest', () => {
    expect(
      dropUngroundedSentences('Fewer events (5.0% vs 6.5%). That is an NNT of 67. Bleeding was similar.', SOURCE)
    ).toEqual({ text: 'Fewer events (5.0% vs 6.5%). Bleeding was similar.', dropped: 1 });
  });
});

describe('isVerbatim', () => {
  const TEXT = 'The primary outcome occurred in 121 patients (5.0%)\nand 160 patients (6.5%) — hazard ratio, 0·75.';
  it('matches across layout, quote, dash and mid-dot differences', () => {
    expect(isVerbatim('occurred in 121 patients (5.0%) and 160 patients (6.5%) - hazard ratio, 0.75', TEXT)).toBe(true);
    expect(isVerbatim('"The primary outcome occurred in 121 patients..."', TEXT)).toBe(true);
  });
  it('rejects changed words or numbers, and fragments too short to mean anything', () => {
    expect(isVerbatim('occurred in 122 patients (5.0%)', TEXT)).toBe(false);
    expect(isVerbatim('The main outcome occurred in 121 patients', TEXT)).toBe(false);
    expect(isVerbatim('121 patients', TEXT)).toBe(false);
  });
});
