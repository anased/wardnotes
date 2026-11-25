import { AiRefusalError, AiValidationError } from '@/lib/ai/errors';
import type { TaskModelConfig } from '@/lib/ai/models';
import { generateStructured, type StructuredResult } from '@/lib/ai/providers';
import type { AiCallRecord } from '@/lib/ai/usage';
import { generatePrimer, type PrimerOutput } from './primer';

jest.mock('@/lib/ai/providers', () => ({ generateStructured: jest.fn() }));
const mockGenerate = generateStructured as jest.MockedFunction<typeof generateStructured>;

const CONFIG: TaskModelConfig = {
  provider: 'anthropic',
  model: 'cheap',
  fallback: { provider: 'anthropic', model: 'strong' },
};

const ARTICLE = {
  title: 'Drug A in Example Disease',
  journal: 'Example Journal',
  year: 2018,
  publicationTypes: ['Randomized Controlled Trial'],
  abstract: 'We randomly assigned 1,000 adults. Events occurred in 5.0% vs 6.5% (HR 0.75; 95% CI, 0.59 to 0.95).',
};

const GOOD: PrimerOutput = {
  question: 'Does drug A reduce events in adults with example disease?',
  bottom_line: 'Yes: fewer events with drug A (5.0% vs 6.5%; HR 0.75).',
  verdict: 'read',
  verdict_reason: 'A large RCT that could change practice.',
  minutes: 25,
};
const UNGROUNDED: PrimerOutput = {
  ...GOOD,
  bottom_line: 'Fewer events with drug A (5.0% vs 6.5%). That is an NNT of 67.',
};

function record(model: string, success = true): AiCallRecord {
  return {
    task: 'articlePrimer',
    provider: 'anthropic',
    model,
    inputTokens: 100,
    outputTokens: 50,
    totalInputTokens: 100,
    costUsd: 0.001,
    success,
  };
}
const ok = (model: string, data: PrimerOutput = GOOD): StructuredResult<PrimerOutput> => ({
  ok: true,
  data,
  record: record(model),
});
const invalid = (model: string): StructuredResult<PrimerOutput> => ({
  ok: false,
  failure: 'validation',
  error: new AiValidationError('verdict: invalid'),
  record: record(model, false),
});
const refused = (model: string): StructuredResult<PrimerOutput> => ({
  ok: false,
  failure: 'refusal',
  error: new AiRefusalError('policy'),
  record: record(model, false),
});

const modelsCalled = () => mockGenerate.mock.calls.map(([req]) => req.choice.model);

beforeEach(() => mockGenerate.mockReset());

describe('generatePrimer', () => {
  it('uses the cheap model when its output is valid and grounded', async () => {
    mockGenerate.mockResolvedValueOnce(ok('cheap'));
    const calls: AiCallRecord[] = [];
    const { primer, servedBy } = await generatePrimer(ARTICLE, calls, CONFIG);
    expect(servedBy.model).toBe('cheap');
    expect(primer).toMatchObject({
      bottomLine: GOOD.bottom_line,
      verdict: 'read',
      minutes: 25,
      abstractOnly: true,
      droppedSentences: 0,
      model: 'cheap',
    });
    expect(calls).toHaveLength(1);
  });

  it('retries, then falls back, when the output has numbers not in the source', async () => {
    mockGenerate
      .mockResolvedValueOnce(ok('cheap', UNGROUNDED))
      .mockResolvedValueOnce(ok('cheap', UNGROUNDED))
      .mockResolvedValueOnce(ok('strong'));
    const calls: AiCallRecord[] = [];
    const { servedBy, primer } = await generatePrimer(ARTICLE, calls, CONFIG);
    expect(modelsCalled()).toEqual(['cheap', 'cheap', 'strong']);
    expect(servedBy.model).toBe('strong');
    expect(primer.droppedSentences).toBe(0);
    expect(calls.map((c) => c.success)).toEqual([false, false, true]);
    expect(calls[0].error).toBe('numbers not in source: 67');
  });

  it('removes the ungrounded sentences when no model gets the numbers right', async () => {
    mockGenerate.mockResolvedValue(ok('any', UNGROUNDED));
    const { primer } = await generatePrimer(ARTICLE, [], CONFIG);
    expect(primer.bottomLine).toBe('Fewer events with drug A (5.0% vs 6.5%).');
    expect(primer.droppedSentences).toBe(1);
  });

  it('goes straight to the fallback after a refusal', async () => {
    mockGenerate.mockResolvedValueOnce(refused('cheap')).mockResolvedValueOnce(ok('strong'));
    await generatePrimer(ARTICLE, [], CONFIG);
    expect(modelsCalled()).toEqual(['cheap', 'strong']);
  });

  it('throws the last error when no model produces valid output, logging every call', async () => {
    mockGenerate.mockResolvedValue(invalid('any'));
    const calls: AiCallRecord[] = [];
    await expect(generatePrimer(ARTICLE, calls, CONFIG)).rejects.toBeInstanceOf(AiValidationError);
    expect(calls).toHaveLength(3);
  });

  it('sets minutes to 0 for skip', async () => {
    mockGenerate.mockResolvedValueOnce(ok('cheap', { ...GOOD, verdict: 'skip', minutes: 5 }));
    const { primer } = await generatePrimer(ARTICLE, [], CONFIG);
    expect(primer.minutes).toBe(0);
  });

  it('checks numbers against the title and year as well as the abstract', async () => {
    mockGenerate.mockResolvedValueOnce(
      ok('cheap', { ...GOOD, question: 'What did the 2018 trial of drug A in 1,000 adults find?' })
    );
    const calls: AiCallRecord[] = [];
    await generatePrimer(ARTICLE, calls, CONFIG);
    expect(calls).toHaveLength(1);
  });
});
