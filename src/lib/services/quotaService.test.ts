const rpc = jest.fn();
const insert = jest.fn();
const createClient = jest.fn((url: string, key: string) => ({
  key,
  rpc,
  from: () => ({ insert }),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, key: string) => createClient(url, key),
}));

type QuotaService = typeof import('./quotaService');

function loadService(env: Record<string, string | undefined>): QuotaService {
  process.env = { ...ORIGINAL_ENV, ...env };
  let mod!: QuotaService;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./quotaService');
  });
  return mod;
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  rpc.mockResolvedValue({ data: { refunded: true }, error: null });
  insert.mockResolvedValue({ error: null });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
  jest.restoreAllMocks();
});

const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
};

describe('refundQuota', () => {
  it('calls refund_usage with the service role key and logs a failed attempt', async () => {
    const { refundQuota } = loadService(ENV);

    await refundQuota('user-1', 'note_improvement', 'AI service error (500).');

    const rpcClient = createClient.mock.results.find((r) => r.value.key === 'service-key');
    expect(rpcClient).toBeDefined();
    expect(rpc).toHaveBeenCalledWith('refund_usage', {
      p_user_id: 'user-1',
      p_feature_type: 'note_improvement',
    });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        feature_type: 'note_improvement',
        api_cost: 0,
        success: false,
        error_message: 'AI service error (500).',
      })
    );
  });

  it('does not throw when the service role key is missing', async () => {
    const { refundQuota } = loadService({ ...ENV, SUPABASE_SERVICE_ROLE_KEY: undefined });

    await expect(refundQuota('user-1', 'flashcard_generation', 'boom')).resolves.toBeUndefined();
    expect(rpc).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('does not throw when the refund RPC fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const { refundQuota } = loadService(ENV);

    await expect(refundQuota('user-1', 'flashcard_generation', 'boom')).resolves.toBeUndefined();
    expect(insert).toHaveBeenCalled();
  });
});

describe('service-role access', () => {
  it('never uses the anon key for quota operations', async () => {
    rpc.mockResolvedValue({ data: { allowed: true, used: 1, limit: 2, remaining: 1 }, error: null });
    const { checkAndIncrementQuota, logApiUsage } = loadService(ENV);

    await checkAndIncrementQuota('user-1', 'note_improvement');
    await logApiUsage('user-1', 'note_improvement', 0.01, 100, true);

    expect(rpc).toHaveBeenCalledWith('check_and_increment_usage', {
      p_user_id: 'user-1',
      p_feature_type: 'note_improvement',
    });
    expect(createClient).toHaveBeenCalled();
    expect(createClient.mock.calls.every(([, key]) => key === 'service-key')).toBe(true);
  });

  it('checkAndIncrementQuota fails closed when the service role key is missing', async () => {
    const { checkAndIncrementQuota } = loadService({ ...ENV, SUPABASE_SERVICE_ROLE_KEY: undefined });

    await expect(checkAndIncrementQuota('user-1', 'note_improvement')).rejects.toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it('logApiUsage never throws, even when misconfigured', async () => {
    const { logApiUsage } = loadService({ ...ENV, SUPABASE_SERVICE_ROLE_KEY: undefined });

    await expect(logApiUsage('user-1', 'note_improvement', 0, undefined, false)).resolves.toBeUndefined();
  });
});

describe('usage log labels', () => {
  it('refunds the shared quota but logs the failure under the specific feature', async () => {
    const { refundQuota } = loadService(ENV);

    await refundQuota('user-1', 'note_improvement', 'boom', 'trial_extraction');

    expect(rpc).toHaveBeenCalledWith('refund_usage', {
      p_user_id: 'user-1',
      p_feature_type: 'note_improvement',
    });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ feature_type: 'trial_extraction', success: false })
    );
  });

  it('defaults the log label to the quota feature', async () => {
    const { refundQuota } = loadService(ENV);

    await refundQuota('user-1', 'flashcard_generation', 'boom');

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ feature_type: 'flashcard_generation' }));
  });
});

describe('logAiCalls', () => {
  const call = (model: string, success: boolean) => ({
    task: 'trialExtraction' as const,
    provider: 'anthropic' as const,
    model,
    inputTokens: 900,
    outputTokens: 300,
    totalInputTokens: 1000,
    costUsd: 0.00025,
    success,
    error: success ? undefined : 'validation: year: expected number',
  });

  it('logs one row per call with provider, model, and input/output tokens', async () => {
    const { logAiCalls } = loadService(ENV);

    await logAiCalls('user-1', 'trial_extraction', [call('claude-haiku-5-5', false), call('claude-opus-5-5', true)]);

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        feature_type: 'trial_extraction',
        ai_task: 'trialExtraction',
        provider: 'anthropic',
        model: 'claude-haiku-5-5',
        input_tokens: 1000,
        output_tokens: 300,
        tokens_used: 1300,
        api_cost: 0.00025,
        success: false,
        error_message: 'validation: year: expected number',
      }),
      expect.objectContaining({ model: 'claude-opus-5-5', success: true, error_message: null }),
    ]);
  });

  it('falls back to the original columns before the details migration is applied', async () => {
    insert
      .mockResolvedValueOnce({ error: { code: 'PGRST204', message: "Could not find the 'model' column" } })
      .mockResolvedValueOnce({ error: null });
    const { logAiCalls } = loadService(ENV);

    await logAiCalls('user-1', 'trial_extraction', [call('claude-haiku-5-5', true)]);

    expect(insert).toHaveBeenCalledTimes(2);
    const retried = insert.mock.calls[1][0];
    expect(retried).toEqual(expect.objectContaining({ feature_type: 'trial_extraction', tokens_used: 1300 }));
    expect(retried).not.toHaveProperty('model');
    expect(retried).not.toHaveProperty('provider');
  });

  it('does nothing for an empty list', async () => {
    const { logAiCalls } = loadService(ENV);
    await logAiCalls('user-1', 'trial_extraction', []);
    expect(insert).not.toHaveBeenCalled();
  });
});
