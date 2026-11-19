import { estimateCostUsd, getTaskModel } from './models';

const ENV_KEYS = [
  'AI_MODEL_TRIAL_EXTRACTION',
  'AI_PROVIDER_TRIAL_EXTRACTION',
  'AI_FALLBACK_MODEL_TRIAL_EXTRACTION',
  'AI_FALLBACK_PROVIDER_TRIAL_EXTRACTION',
  'AI_PROVIDER_CLINICAL_QUESTION',
  'AI_MODEL_CLINICAL_QUESTION',
];

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe('getTaskModel', () => {
  it('routes trial extraction to Haiku with Opus as fallback by default', () => {
    expect(getTaskModel('trialExtraction')).toEqual({
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
      effort: 'low',
      fallback: { provider: 'anthropic', model: 'claude-opus-5-5', effort: 'low' },
    });
  });

  it('keeps the current model for other tasks', () => {
    for (const task of ['flashcardGeneration', 'clinicalQuestion', 'noteImprovement'] as const) {
      expect(getTaskModel(task).model).toBe('claude-opus-5-5');
    }
  });

  it('applies env overrides', () => {
    process.env.AI_MODEL_TRIAL_EXTRACTION = 'claude-sonnet-5-5';
    process.env.AI_FALLBACK_MODEL_TRIAL_EXTRACTION = 'claude-opus-5-5';
    const cfg = getTaskModel('trialExtraction');
    expect(cfg.model).toBe('claude-sonnet-5-5');
    expect(cfg.fallback?.model).toBe('claude-opus-5-5');
  });

  it('switches trial extraction to OpenAI when provider and model are both set', () => {
    process.env.AI_PROVIDER_TRIAL_EXTRACTION = 'openai';
    process.env.AI_MODEL_TRIAL_EXTRACTION = 'some-openai-model';
    expect(getTaskModel('trialExtraction')).toMatchObject({ provider: 'openai', model: 'some-openai-model' });
  });

  it('requires a model name when switching provider', () => {
    process.env.AI_PROVIDER_TRIAL_EXTRACTION = 'openai';
    expect(() => getTaskModel('trialExtraction')).toThrow(/AI_MODEL_TRIAL_EXTRACTION/);
  });

  it('rejects unknown providers', () => {
    process.env.AI_PROVIDER_TRIAL_EXTRACTION = 'gemini';
    expect(() => getTaskModel('trialExtraction')).toThrow(/must be one of/);
  });

  it('keeps Anthropic-only tasks on Anthropic', () => {
    process.env.AI_PROVIDER_CLINICAL_QUESTION = 'openai';
    process.env.AI_MODEL_CLINICAL_QUESTION = 'x';
    expect(() => getTaskModel('clinicalQuestion')).toThrow(/only supports the anthropic provider/);
  });
});

describe('estimateCostUsd', () => {
  it('prices Haiku and Opus per million tokens', () => {
    const usage = { inputTokens: 1_000, outputTokens: 500 };
    expect(estimateCostUsd('claude-haiku-5-5', usage)).toBe(0.00035); // 1000*0.1e-6 + 500*0.5e-6
    expect(estimateCostUsd('claude-opus-5-5', usage)).toBe(0.014); // 1000*4e-6 + 500*20e-6
  });

  it('prices cache reads and writes', () => {
    expect(
      estimateCostUsd('claude-opus-5-5', { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 1_000_000, cacheReadTokens: 1_000_000 })
    ).toBe(5.2);
  });

  it('returns 0 for unknown models', () => {
    expect(estimateCostUsd('unknown-model', { inputTokens: 1000, outputTokens: 1000 })).toBe(0);
  });
});
