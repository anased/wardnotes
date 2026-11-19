import { AiRefusalError, AiValidationError } from '@/lib/ai/errors';
import type { TaskModelConfig } from '@/lib/ai/models';
import { generateStructured, type StructuredResult } from '@/lib/ai/providers';
import type { AiCallRecord } from '@/lib/ai/usage';
import { extractTrialFromAbstract, type ExtractedTrial } from './extractTrial';

jest.mock('@/lib/ai/providers', () => ({ generateStructured: jest.fn() }));
const mockGenerate = generateStructured as jest.MockedFunction<typeof generateStructured>;

const CONFIG: TaskModelConfig = {
  provider: 'anthropic',
  model: 'cheap',
  fallback: { provider: 'anthropic', model: 'strong' },
};

const TRIAL: ExtractedTrial = {
  is_clinical_trial: true,
  acronym: 'POINT',
  full_name: null,
  year: 2018,
  population: 'p',
  intervention: 'i',
  comparator: 'c',
  result: 'r',
  notes: null,
};

function record(model: string, success: boolean): AiCallRecord {
  return {
    task: 'trialExtraction',
    provider: 'anthropic',
    model,
    inputTokens: 100,
    outputTokens: 50,
    totalInputTokens: 100,
    costUsd: 0.001,
    success,
  };
}

const ok = (model: string): StructuredResult<ExtractedTrial> => ({ ok: true, data: TRIAL, record: record(model, true) });
const invalid = (model: string): StructuredResult<ExtractedTrial> => ({
  ok: false,
  failure: 'validation',
  error: new AiValidationError('year: expected number'),
  record: record(model, false),
});
const refused = (model: string): StructuredResult<ExtractedTrial> => ({
  ok: false,
  failure: 'refusal',
  error: new AiRefusalError('bio'),
  record: record(model, false),
});

const modelsCalled = () => mockGenerate.mock.calls.map(([req]) => req.choice.model);

beforeEach(() => mockGenerate.mockReset());

describe('extractTrialFromAbstract model routing', () => {
  it('uses the cheap model when its output validates', async () => {
    mockGenerate.mockResolvedValueOnce(ok('cheap'));
    const calls: AiCallRecord[] = [];
    const result = await extractTrialFromAbstract({ abstract: 'text' }, calls, CONFIG);
    expect(result.servedBy.model).toBe('cheap');
    expect(modelsCalled()).toEqual(['cheap']);
    expect(calls).toHaveLength(1);
  });

  it('retries once with the same model after a validation failure', async () => {
    mockGenerate.mockResolvedValueOnce(invalid('cheap')).mockResolvedValueOnce(ok('cheap'));
    const result = await extractTrialFromAbstract({ abstract: 'text' }, [], CONFIG);
    expect(result.servedBy.model).toBe('cheap');
    expect(modelsCalled()).toEqual(['cheap', 'cheap']);
  });

  it('falls back to the stronger model after two validation failures, logging every call', async () => {
    mockGenerate
      .mockResolvedValueOnce(invalid('cheap'))
      .mockResolvedValueOnce(invalid('cheap'))
      .mockResolvedValueOnce(ok('strong'));
    const calls: AiCallRecord[] = [];
    const result = await extractTrialFromAbstract({ abstract: 'text' }, calls, CONFIG);
    expect(result.servedBy.model).toBe('strong');
    expect(modelsCalled()).toEqual(['cheap', 'cheap', 'strong']);
    expect(calls.map((c) => [c.model, c.success])).toEqual([
      ['cheap', false],
      ['cheap', false],
      ['strong', true],
    ]);
  });

  it('skips the retry after a refusal and goes straight to the stronger model', async () => {
    mockGenerate.mockResolvedValueOnce(refused('cheap')).mockResolvedValueOnce(ok('strong'));
    const result = await extractTrialFromAbstract({ abstract: 'text' }, [], CONFIG);
    expect(result.servedBy.model).toBe('strong');
    expect(modelsCalled()).toEqual(['cheap', 'strong']);
  });

  it('throws the last failure when every model fails, with all calls recorded', async () => {
    mockGenerate.mockResolvedValue(invalid('x'));
    const calls: AiCallRecord[] = [];
    await expect(extractTrialFromAbstract({ abstract: 'text' }, calls, CONFIG)).rejects.toBeInstanceOf(AiValidationError);
    expect(calls).toHaveLength(3);
  });

  it('propagates API errors immediately', async () => {
    mockGenerate.mockRejectedValueOnce(new Error('rate limited'));
    await expect(extractTrialFromAbstract({ abstract: 'text' }, [], CONFIG)).rejects.toThrow('rate limited');
    expect(modelsCalled()).toEqual(['cheap']);
  });

  it('sends title, journal and year with the abstract', async () => {
    mockGenerate.mockResolvedValueOnce(ok('cheap'));
    await extractTrialFromAbstract({ title: 'T', journal: 'J', year: 2018, abstract: 'A' }, [], CONFIG);
    expect(mockGenerate.mock.calls[0][0].user).toBe(
      '<source>\nTitle: T\nJournal: J\nPublication year: 2018\n\nA\n</source>'
    );
  });
});
