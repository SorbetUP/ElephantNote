import { describe, expect, it, vi } from 'vitest';
import { waitForLocalApiAsset } from '../hooks/useEditor';

describe('waitForLocalApiAsset', () => {
  it('retries until the asset is reachable', async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = fetchMock;

    await waitForLocalApiAsset(
      'http://127.0.0.1:1234',
      '/dist/js/lute/lute.min.js',
      { attempts: 3, delayMs: 0, timeoutMs: 2000, maxDelayMs: 0 },
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/dist/js/lute/lute.min.js');
  });

  it('throws after exhausting retries', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = fetchMock;

    await expect(
      waitForLocalApiAsset(
        'http://127.0.0.1:1234',
        '/dist/js/lute/lute.min.js',
        { attempts: 2, delayMs: 0, timeoutMs: 2000, maxDelayMs: 0 },
      ),
    ).rejects.toThrow(/local_api_asset_unavailable/);
  });
});

