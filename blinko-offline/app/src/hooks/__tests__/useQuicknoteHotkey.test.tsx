import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

const { isInTauriMock } = vi.hoisted(() => ({
  isInTauriMock: vi.fn<[], boolean>(() => true),
}));

const { navigateMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
}));

type ListenerCb = (event?: any) => void | Promise<void>;

const { listenMock, listeners } = vi.hoisted(() => {
  const map = new Map<string, ListenerCb>();
  return {
    listeners: map,
    listenMock: vi.fn(async (eventName: string, cb: ListenerCb) => {
      map.set(eventName, cb);
      return () => map.delete(eventName);
    }),
  };
});

const { blinkoMock } = vi.hoisted(() => ({
  blinkoMock: { isCreateMode: false },
}));

vi.mock('@/lib/tauriHelper', () => ({
  isInTauri: () => isInTauriMock(),
}));

vi.mock('@/lib/tauriEvent', () => ({
  getTauriListen: async () => ((...args: any[]) => listenMock(...args)),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<any>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/store/blinkoStore', () => ({
  BlinkoStore: class BlinkoStore {},
}));

vi.mock('@/store', () => ({
  RootStore: {
    Get: (store: any) => {
      if (store?.name === 'BlinkoStore') return blinkoMock;
      return {};
    },
  },
}));

async function flushMicrotasks() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

async function waitForListener(name: string) {
  for (let i = 0; i < 50; i++) {
    if (listeners.has(name)) return;
    await flushMicrotasks();
  }
  throw new Error(`Listener not registered: ${name}. Registered: ${[...listeners.keys()].join(', ')}`);
}

describe('useQuicknoteHotkey (desktop)', () => {
  beforeEach(() => {
    isInTauriMock.mockReturnValue(true);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    navigateMock.mockClear();
    listenMock.mockClear();
    listeners.clear();
    blinkoMock.isCreateMode = false;
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('registers listeners and focuses editor on quicknote-triggered', async () => {
    const { useQuicknoteHotkey } = await import('../useQuicknoteHotkey');

    function Comp() {
      useQuicknoteHotkey(true);
      return null;
    }

    const focusSpy = vi.spyOn(HTMLElement.prototype as any, 'focus').mockImplementation(() => {});

    // Provide editor DOM expected by the hook.
    const editor = document.createElement('div');
    editor.id = 'global-editor';
    const textarea = document.createElement('textarea');
    editor.appendChild(textarea);
    document.body.appendChild(editor);

    render(<Comp />);

    // Let the effect run; it loads @tauri-apps/api/event dynamically.
    await act(async () => {
      await flushMicrotasks();
    });

    await waitForListener('quicknote-triggered');

    expect(listenMock).toHaveBeenCalled();
    expect(listeners.has('quicknote-triggered')).toBe(true);

    await act(async () => {
      const cb = listeners.get('quicknote-triggered')!;
      cb();
    });

    expect(blinkoMock.isCreateMode).toBe(true);
    expect(focusSpy).toHaveBeenCalled();

    focusSpy.mockRestore();
  });

  it('navigates to hotkey settings on navigate-to-settings', async () => {
    const { useQuicknoteHotkey } = await import('../useQuicknoteHotkey');

    function Comp() {
      useQuicknoteHotkey(true);
      return null;
    }

    render(<Comp />);
    await act(async () => {
      await flushMicrotasks();
    });

    await waitForListener('navigate-to-settings');

    await act(async () => {
      const cb = listeners.get('navigate-to-settings')!;
      cb();
    });

    expect(navigateMock).toHaveBeenCalledWith('/settings?tab=hotkey');
  });

  it('does nothing when not in Tauri', async () => {
    isInTauriMock.mockReturnValue(false);
    const { useQuicknoteHotkey } = await import('../useQuicknoteHotkey');

    function Comp() {
      useQuicknoteHotkey(true);
      return null;
    }

    render(<Comp />);
    await act(async () => {
      await flushMicrotasks();
    });

    expect(listenMock).not.toHaveBeenCalled();
  });
});
