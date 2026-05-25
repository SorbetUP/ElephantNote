import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('blinkoEndpoint (web mode)', () => {
  beforeEach(() => {
    // @ts-expect-error - ensure web mode
    delete window.__TAURI__;
    window.localStorage.clear();
    vi.resetModules();
  });

  it('resolveBaseUrl defaults to window.location.origin', async () => {
    const { resolveBaseUrl } = await import('../blinkoEndpoint');
    const base = await resolveBaseUrl();
    expect(base).toBe(window.location.origin);
  });

  it('resolveBaseUrl uses stored http(s) endpoint', async () => {
    window.localStorage.setItem('blinkoEndpoint', '"https://example.com"');
    const { resolveBaseUrl } = await import('../blinkoEndpoint');
    const base = await resolveBaseUrl();
    expect(base).toBe('https://example.com');
  });

  it('resolveBaseUrl ignores invalid stored endpoint and falls back to origin', async () => {
    window.localStorage.setItem('blinkoEndpoint', '"not-a-url"');
    const { resolveBaseUrl } = await import('../blinkoEndpoint');
    const base = await resolveBaseUrl();
    expect(base).toBe(window.location.origin);
  });

  it('getBlinkoEndpoint prefixes relative paths with base origin', async () => {
    const { getBlinkoEndpoint } = await import('../blinkoEndpoint');
    const url = getBlinkoEndpoint('/api/notes');
    expect(url).toBe(`${window.location.origin}/api/notes`);
  });

  it('getBlinkoEndpoint returns absolute URLs unchanged', async () => {
    const { getBlinkoEndpoint } = await import('../blinkoEndpoint');
    expect(getBlinkoEndpoint('https://example.com/a')).toBe('https://example.com/a');
  });
});

