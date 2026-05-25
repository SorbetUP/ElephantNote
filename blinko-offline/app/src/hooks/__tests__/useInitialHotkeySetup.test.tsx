import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

const { isInTauriMock, isDesktopMock } = vi.hoisted(() => ({
  isInTauriMock: vi.fn<[], boolean>(() => true),
  isDesktopMock: vi.fn<[], boolean>(() => true),
}));

let useInitialHotkeySetupImport: Promise<any> | null = null;
function importUseInitialHotkeySetup() {
  // `vitest.config.ts` uses `isolate: true`, so module caching across files is already prevented.
  // Avoid `vi.resetModules()` here because it is expensive and can push this test over the 5s timeout.
  if (!useInitialHotkeySetupImport) useInitialHotkeySetupImport = import('../useInitialHotkeySetup');
  return useInitialHotkeySetupImport;
}

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(async () => null),
}));

const { blinkoMock } = vi.hoisted(() => ({
  blinkoMock: {
    config: {
      call: vi.fn(async () => {}),
      value: { desktopHotkeys: undefined as any },
    },
  },
}));

vi.mock('@/lib/tauriHelper', () => ({
  isInTauri: () => isInTauriMock(),
  isDesktop: () => isDesktopMock(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => invokeMock(...args),
}));

vi.mock('@/store/blinkoStore', () => ({
  BlinkoStore: class BlinkoStore {},
}));

vi.mock('@/store', () => ({
  RootStore: {
    Get: (store: any) => {
      if (store?.name === 'BlinkoStore') return blinkoMock;
      if (store?.name === 'UserStore') return { isLogin: true };
      return {};
    },
  },
}));

async function flushMicrotasks() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function Harness() {
  // Imported dynamically in the test to ensure mocks apply.
  return null;
}

describe('useInitialHotkeySetup (desktop)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    invokeMock.mockClear();
    blinkoMock.config.call.mockClear();
    blinkoMock.config.value.desktopHotkeys = undefined;
    isInTauriMock.mockReturnValue(true);
    isDesktopMock.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('registers default quicknote/quickai shortcuts and enables text selection monitoring', async () => {
    const { useInitialHotkeySetup } = await importUseInitialHotkeySetup();

    function Comp() {
      useInitialHotkeySetup();
      return null;
    }

    render(<Comp />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await flushMicrotasks();
    });

    expect(blinkoMock.config.call).toHaveBeenCalledTimes(1);

    expect(invokeMock).toHaveBeenCalledWith('register_hotkey', {
      shortcut: 'Shift+Space',
      command: 'quicknote',
    });
    expect(invokeMock).toHaveBeenCalledWith('register_hotkey', {
      shortcut: 'Alt+Space',
      command: 'quickai',
    });
    expect(invokeMock).toHaveBeenCalledWith('setup_text_selection_monitoring', {
      enabled: true,
      triggerModifier: 'none',
    });
  });

  it('does nothing when not running in desktop Tauri', async () => {
    isInTauriMock.mockReturnValue(false);

    const { useInitialHotkeySetup } = await importUseInitialHotkeySetup();
    function Comp() {
      useInitialHotkeySetup();
      return null;
    }

    render(<Comp />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
      await flushMicrotasks();
    });

    expect(invokeMock).not.toHaveBeenCalled();
    expect(blinkoMock.config.call).not.toHaveBeenCalled();
  });
});
