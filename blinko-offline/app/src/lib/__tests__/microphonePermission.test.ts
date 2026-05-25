import { describe, expect, it, vi, beforeEach } from 'vitest';

const stubs = vi.hoisted(() => ({
  platform: vi.fn(() => 'web'),
  confirm: vi.fn(() => false),
  alert: vi.fn(),
  openAppSettings: vi.fn(),
}));

vi.mock('tauri-plugin-blinko-api', () => ({
  openAppSettings: () => stubs.openAppSettings(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-os', () => ({
  platform: () => stubs.platform(),
}));

// Keep unrelated imports from doing real work.
vi.mock('../i18n', () => ({ default: { t: (k: string) => k } }));
vi.mock('@/store', () => ({ RootStore: { Get: () => ({}) } }));
vi.mock('@/store/module/Toast/Toast', () => ({ ToastPlugin: class ToastPlugin {} }));
vi.mock('@/store/user', () => ({ UserStore: class UserStore {} }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn() }));
vi.mock('@tauri-apps/plugin-upload', () => ({ download: vi.fn() }));
vi.mock('@tauri-apps/api/path', () => ({ downloadDir: vi.fn(), join: vi.fn() }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openPath: vi.fn(), openUrl: vi.fn() }));

import { checkMicrophonePermission, requestMicrophonePermission } from '@/lib/tauriHelper';

describe('Microphone permission helpers', () => {
  beforeEach(() => {
    localStorage.clear();
    stubs.platform.mockReturnValue('web');
    stubs.confirm.mockReset();
    stubs.alert.mockReset();
    stubs.openAppSettings.mockReset();

    // Ensure we start in "web" mode unless a test opts into Tauri runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).__TAURI__;

    // Browser dialogs.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).confirm = stubs.confirm;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).alert = stubs.alert;

    // Media devices.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).mediaDevices = {
      getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })),
    };

    // Permissions API.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).permissions = {
      query: vi.fn(async () => ({ state: 'prompt' })),
    };
  });

  it('requestMicrophonePermission returns true when cached', async () => {
    localStorage.setItem('microphone_permission_granted', 'true');
    const ok = await requestMicrophonePermission();
    expect(ok).toBe(true);
  });

  it('requestMicrophonePermission caches permission when getUserMedia succeeds', async () => {
    const ok = await requestMicrophonePermission();
    expect(ok).toBe(true);
    expect(localStorage.getItem('microphone_permission_granted')).toBe('true');
  });

  it('requestMicrophonePermission shows Android guidance (confirm + open settings) on denial', async () => {
    // Opt into Tauri runtime and Android platform.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI__ = {};
    stubs.platform.mockReturnValue('android');

    // Deny getUserMedia.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).mediaDevices.getUserMedia = vi.fn(async () => null);

    stubs.confirm.mockReturnValue(true);

    const ok = await requestMicrophonePermission();
    expect(ok).toBe(false);

    expect(stubs.confirm).toHaveBeenCalled();
    expect(String(stubs.confirm.mock.calls[0]?.[0] ?? '')).toContain('Microphone permission is required');
    expect(stubs.openAppSettings).toHaveBeenCalledTimes(1);
  });

  it('checkMicrophonePermission uses Permissions API when granted', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).permissions.query = vi.fn(async () => ({ state: 'granted' }));

    const ok = await checkMicrophonePermission();
    expect(ok).toBe(true);
    expect(localStorage.getItem('microphone_permission_granted')).toBe('true');
  });
});
