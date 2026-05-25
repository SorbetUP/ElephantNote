import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const { platformMock } = vi.hoisted(() => ({
  platformMock: vi.fn(() => 'macos'),
}));

vi.mock('@tauri-apps/plugin-os', () => ({
  platform: () => platformMock(),
}));

describe('tauriHelper web gating', () => {
  let mod: typeof import('../tauriHelper');

  beforeAll(async () => {
    // Import once; this module pulls in a lot of dependencies and can be slow.
    mod = await import('../tauriHelper');
  }, 20_000);

  beforeEach(() => {
    // @ts-expect-error - cleanup for web mode
    delete window.__TAURI__;
    platformMock.mockClear();
  });

  it('does not call platform() when __TAURI__ is missing', async () => {
    expect(mod.isDesktop()).toBe(false);
    expect(mod.isAndroid()).toBe(false);
    expect(mod.isWindows()).toBe(false);
    expect(platformMock).not.toHaveBeenCalled();
  });

  it('calls platform() when running under Tauri', async () => {
    // @ts-expect-error - mark as Tauri runtime
    window.__TAURI__ = {};
    expect(mod.isDesktop()).toBe(true);
    expect(platformMock).toHaveBeenCalled();
  });
});
