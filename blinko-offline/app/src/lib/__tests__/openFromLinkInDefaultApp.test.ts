import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mock i18n initialization (i18next plugins touch browser APIs).
vi.mock('../i18n', () => ({
  default: { t: (key: string) => key },
}));

// Mock helper to keep module load light.
vi.mock('../helper', () => ({
  helper: { download: { downloadByLink: vi.fn() } },
}));

// Mock endpoint resolution.
vi.mock('../blinkoEndpoint', () => ({
  getBlinkoEndpoint: (path: string) => `http://127.0.0.1:61164${path.startsWith('/') ? '' : '/'}${path}`,
}));

// Mock stores used for token + toast.
vi.mock('@/store/user', () => ({
  UserStore: class UserStore {},
}));
vi.mock('@/store/module/Toast/Toast', () => ({
  ToastPlugin: class ToastPlugin {},
}));
const toast = {
  loading: vi.fn(),
  dismiss: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
};
const user = { tokenData: { value: { token: 'test-token' } } };
vi.mock('@/store', () => ({
  RootStore: {
    Get: (store: any) => {
      if (store?.name === 'UserStore') return user;
      if (store?.name === 'ToastPlugin') return toast;
      return {};
    },
  },
}));

// Mock Tauri APIs.
const platformMock = vi.fn<[], any>(() => 'macos');
vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => platformMock() }));

const downloadMock = vi.fn(async () => {});
vi.mock('@tauri-apps/plugin-upload', () => ({ download: (...args: any[]) => downloadMock(...args) }));

const downloadDirMock = vi.fn(async () => '/tmp/Downloads');
const appDataDirMock = vi.fn(async () => '/tmp/AppData');
const joinMock = vi.fn(async (...parts: string[]) => parts.join('/').replaceAll('//', '/'));
vi.mock('@tauri-apps/api/path', () => ({
  downloadDir: () => downloadDirMock(),
  appDataDir: () => appDataDirMock(),
  join: (...args: any[]) => joinMock(...args),
}));

const mkdirMock = vi.fn(async () => {});
vi.mock('@tauri-apps/plugin-fs', () => ({
  mkdir: (...args: any[]) => mkdirMock(...args),
}));

const openPathMock = vi.fn(async () => {});
const openUrlMock = vi.fn(async () => {});
vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: (...args: any[]) => openPathMock(...args),
  openUrl: (...args: any[]) => openUrlMock(...args),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn(async () => null) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => null) }));
const presentShareSheetMock = vi.fn(async () => {});
vi.mock('tauri-plugin-blinko-api', () => ({
  setStatusBarColor: vi.fn(),
  presentShareSheet: (...args: any[]) => presentShareSheetMock(...args),
}));

describe('openFromLinkInDefaultApp', () => {
  const originalOpen = window.open;

  beforeEach(() => {
    // @ts-expect-error - we intentionally set Tauri marker.
    window.__TAURI__ = {};
    window.open = vi.fn();
    platformMock.mockReturnValue('macos');
    downloadMock.mockClear();
    openPathMock.mockClear();
    openUrlMock.mockClear();
    downloadDirMock.mockClear();
    appDataDirMock.mockClear();
    joinMock.mockClear();
    mkdirMock.mockClear();
    presentShareSheetMock.mockClear();
  });

  afterEach(() => {
    window.open = originalOpen;
    // @ts-expect-error - cleanup
    delete window.__TAURI__;
  });

  it('downloads to Downloads and opens via openPath (desktop)', async () => {
    const { openFromLinkInDefaultApp } = await import('../tauriHelper');

    await openFromLinkInDefaultApp('/api/file/196', 'test.pdf');

    expect(downloadDirMock).toHaveBeenCalled();
    expect(joinMock).toHaveBeenCalled();
    expect(downloadMock).toHaveBeenCalledTimes(1);
    expect(openPathMock).toHaveBeenCalledTimes(1);

    const [urlArg, pathArg] = downloadMock.mock.calls[0];
    expect(String(urlArg)).toContain('http://127.0.0.1:61164/api/file/196');
    expect(String(urlArg)).toContain('token=test-token');
    expect(String(pathArg)).toContain('/tmp/Downloads/test.pdf');
  });

  it('sanitizes filenames before saving/opening', async () => {
    const { openFromLinkInDefaultApp } = await import('../tauriHelper');

    await openFromLinkInDefaultApp('/api/file/196', 'a:b?c*.pdf');

    const [, pathArg] = downloadMock.mock.calls[0];
    // Windows-forbidden chars should be replaced with underscores.
    expect(String(pathArg)).toContain('/tmp/Downloads/a_b_c_.pdf');
  });

  it('on iOS: downloads to app data and shows the share sheet', async () => {
    platformMock.mockReturnValue('ios');
    const { openFromLinkInDefaultApp } = await import('../tauriHelper');

    await openFromLinkInDefaultApp('/api/file/196', 'test.pdf');

    expect(appDataDirMock).toHaveBeenCalled();
    expect(mkdirMock).toHaveBeenCalled();
    expect(downloadMock).toHaveBeenCalledTimes(1);
    expect(presentShareSheetMock).toHaveBeenCalledTimes(1);
    expect(openPathMock).not.toHaveBeenCalled();
    expect(openUrlMock).not.toHaveBeenCalled();

    const [urlArg, pathArg] = downloadMock.mock.calls[0];
    expect(String(urlArg)).toContain('http://127.0.0.1:61164/api/file/196');
    expect(String(urlArg)).toContain('token=test-token');
    expect(String(pathArg)).toContain('/tmp/AppData/blinko/open-with-default/test.pdf');
  });

  it('on web: opens in a new tab', async () => {
    // @ts-expect-error - cleanup
    delete window.__TAURI__;
    const { openFromLinkInDefaultApp } = await import('../tauriHelper');

    await openFromLinkInDefaultApp('https://example.com/file.pdf', 'file.pdf');

    expect(downloadMock).not.toHaveBeenCalled();
    expect(openPathMock).not.toHaveBeenCalled();
    expect(window.open).toHaveBeenCalledWith(expect.stringContaining('https://example.com/file.pdf'), '_blank');
  });
});
