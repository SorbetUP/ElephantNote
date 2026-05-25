import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => invokeMock(...args),
}));

describe('trpc localInvokeLink', () => {
  beforeEach(() => {
    vi.resetModules();
    invokeMock.mockReset();

    // Simulate Tauri runtime with no resolved base URL so getBlinkoEndpoint('/api/trpc')
    // returns a non-http path and forces the localInvokeLink fallback.
    (window as any).__TAURI__ = true;
    window.localStorage.removeItem('blinkoEndpoint');

    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'notes_list') return Promise.resolve([]);
      return Promise.resolve(null);
    });
  });

  it('does not crash when falling back to localInvokeLink', async () => {
    const { api } = await import('../trpc');
    const res = await (api as any).notes.list.query({});
    expect(Array.isArray(res)).toBe(true);
  });

  it('returns arrays for plugin queries in command-only fallback', async () => {
    const { api } = await import('../trpc');
    const res = await (api as any).plugin.getInstalledPlugins.query();
    expect(Array.isArray(res)).toBe(true);
  });
});
