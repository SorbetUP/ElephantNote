import { beforeEach, describe, expect, it, vi } from 'vitest';

const stubs = vi.hoisted(() => ({
  setStatusBarColor: vi.fn(),
}));

vi.mock('tauri-plugin-blinko-api', () => ({
  setStatusBarColor: (...args: any[]) => stubs.setStatusBarColor(...args),
}));

vi.mock('@tauri-apps/plugin-os', () => ({
  platform: () => 'android',
}));

// Keep unrelated imports from doing real work.
vi.mock('../i18n', () => ({ default: { t: (k: string) => k } }));
vi.mock('@/store', () => ({ RootStore: { Get: () => ({}) } }));
vi.mock('@/store/module/Toast/Toast', () => ({ ToastPlugin: class ToastPlugin {} }));
vi.mock('@/store/user', () => ({ UserStore: class UserStore {} }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn() }));
vi.mock('@tauri-apps/plugin-upload', () => ({ download: vi.fn() }));
vi.mock('@tauri-apps/api/path', () => ({ downloadDir: vi.fn(), join: vi.fn() }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openPath: vi.fn(), openUrl: vi.fn() }));

import { setTauriTheme } from '@/lib/tauriHelper';

describe('setTauriTheme (Android status bar color)', () => {
  beforeEach(() => {
    stubs.setStatusBarColor.mockClear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI__ = {};
  });

  it('uses setStatusBarColor on Android', async () => {
    await setTauriTheme('light');
    expect(stubs.setStatusBarColor).toHaveBeenCalledWith('#f8f8f8');

    await setTauriTheme('dark');
    expect(stubs.setStatusBarColor).toHaveBeenCalledWith('#000000');
  });
});
