// api/test/ssm.test.ts
// SSM is mocked: these tests check how parameters become environment variables, not AWS itself.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.hoisted(() => vi.fn());
vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: class {
    send = send;
  },
  GetParametersByPathCommand: class {
    constructor(public input: Record<string, unknown>) {}
  },
}));

import { loadSsmParams } from '../src/lib/ssm';

const KEYS = ['MONGODB_URI', 'JWT_SECRET', 'EXTRA_FROM_PAGE_TWO'] as const;

describe('loadSsmParams', () => {
  beforeEach(() => {
    send.mockReset();
    for (const key of KEYS) delete process.env[key];
  });
  afterEach(() => {
    for (const key of KEYS) delete process.env[key];
  });

  it('puts each parameter in process.env under its name without the prefix', async () => {
    send.mockResolvedValueOnce({
      Parameters: [
        { Name: '/dougfitness/prod/MONGODB_URI', Value: 'mongodb+srv://example' },
        { Name: '/dougfitness/prod/JWT_SECRET', Value: 'a-secret' },
      ],
    });
    await loadSsmParams('/dougfitness/prod');
    expect(process.env.MONGODB_URI).toBe('mongodb+srv://example');
    expect(process.env.JWT_SECRET).toBe('a-secret');
  });

  it('asks SSM to decrypt, for the right path', async () => {
    send.mockResolvedValueOnce({ Parameters: [] });
    await loadSsmParams('/dougfitness/prod');
    expect(send.mock.calls[0]?.[0].input).toMatchObject({ Path: '/dougfitness/prod', WithDecryption: true });
  });

  it('follows pagination until there is no NextToken', async () => {
    send
      .mockResolvedValueOnce({
        Parameters: [{ Name: '/dougfitness/prod/MONGODB_URI', Value: 'first' }],
        NextToken: 'page-2',
      })
      .mockResolvedValueOnce({ Parameters: [{ Name: '/dougfitness/prod/EXTRA_FROM_PAGE_TWO', Value: 'second' }] });
    await loadSsmParams('/dougfitness/prod');

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0].input).toMatchObject({ NextToken: 'page-2' });
    expect(process.env.MONGODB_URI).toBe('first');
    expect(process.env.EXTRA_FROM_PAGE_TWO).toBe('second');
  });

  it('tolerates a trailing slash on the prefix', async () => {
    send.mockResolvedValueOnce({ Parameters: [{ Name: '/dougfitness/prod/JWT_SECRET', Value: 'a-secret' }] });
    await loadSsmParams('/dougfitness/prod/');
    expect(process.env.JWT_SECRET).toBe('a-secret');
  });

  it('skips entries with no name or value and tolerates an empty result', async () => {
    send.mockResolvedValueOnce({ Parameters: [{ Name: '/dougfitness/prod/JWT_SECRET' }, { Value: 'orphan' }] });
    await loadSsmParams('/dougfitness/prod');
    expect(process.env.JWT_SECRET).toBeUndefined();

    send.mockResolvedValueOnce({});
    await expect(loadSsmParams('/dougfitness/prod')).resolves.toBeUndefined();
  });

  it('lets an SSM failure propagate so the container fails fast instead of starting without secrets', async () => {
    send.mockRejectedValueOnce(new Error('AccessDeniedException'));
    await expect(loadSsmParams('/dougfitness/prod')).rejects.toThrow('AccessDeniedException');
  });
});
