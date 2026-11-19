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

  it('does not throw and skips the RPC when the service role key is missing', async () => {
    const { refundQuota } = loadService({ ...ENV, SUPABASE_SERVICE_ROLE_KEY: undefined });

    await expect(refundQuota('user-1', 'flashcard_generation', 'boom')).resolves.toBeUndefined();
    expect(rpc).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('does not throw when the refund RPC fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const { refundQuota } = loadService(ENV);

    await expect(refundQuota('user-1', 'flashcard_generation', 'boom')).resolves.toBeUndefined();
    expect(insert).toHaveBeenCalled();
  });
});
