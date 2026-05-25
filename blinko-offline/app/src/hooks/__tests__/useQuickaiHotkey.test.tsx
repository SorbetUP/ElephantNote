import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

const { isInTauriMock, isDesktopMock } = vi.hoisted(() => ({
  isInTauriMock: vi.fn<[], boolean>(() => true),
  isDesktopMock: vi.fn<[], boolean>(() => true),
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

const { aiStoreMock } = vi.hoisted(() => ({
  aiStoreMock: {
    newChat: vi.fn(async () => {}),
    newChatWithSuggestion: vi.fn(async (_prompt: string) => {}),
  },
}));

vi.mock('@/lib/tauriHelper', () => ({
  isInTauri: () => isInTauriMock(),
  isDesktop: () => isDesktopMock(),
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

vi.mock('@/store/aiStore', () => ({
  AiStore: class AiStore {},
}));

vi.mock('@/store', () => ({
  RootStore: {
    Get: (store: any) => {
      if (store?.name === 'AiStore') return aiStoreMock;
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

describe('useQuickaiHotkey (desktop)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    isInTauriMock.mockReturnValue(true);
    isDesktopMock.mockReturnValue(true);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    navigateMock.mockClear();
    listenMock.mockClear();
    listeners.clear();
    aiStoreMock.newChat.mockClear();
    aiStoreMock.newChatWithSuggestion.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('navigates to /ai on quickai-triggered', async () => {
    const { useQuickaiHotkey } = await import('../useQuickaiHotkey');

    function Comp() {
      useQuickaiHotkey();
      return null;
    }

    render(<Comp />);
    await act(async () => {
      await flushMicrotasks();
    });

    await waitForListener('quickai-triggered');

    await act(async () => {
      const cb = listeners.get('quickai-triggered')!;
      cb();
    });

    expect(navigateMock).toHaveBeenCalledWith('/ai');
  });

  it('handles navigate-to-ai-with-prompt once when triggered twice rapidly (dedupe)', async () => {
    const { useQuickaiHotkey } = await import('../useQuickaiHotkey');

    function Comp() {
      useQuickaiHotkey();
      return null;
    }

    render(<Comp />);
    await act(async () => {
      await flushMicrotasks();
    });

    await waitForListener('navigate-to-ai-with-prompt');

    const payloadEvent = { payload: 'hello' };

    await act(async () => {
      const cb = listeners.get('navigate-to-ai-with-prompt')!;
      await cb(payloadEvent);
      await cb(payloadEvent);
    });

    expect(aiStoreMock.newChat).toHaveBeenCalledTimes(1);
    expect(aiStoreMock.newChatWithSuggestion).toHaveBeenCalledTimes(1);
    expect(aiStoreMock.newChatWithSuggestion).toHaveBeenCalledWith('hello');
    expect(navigateMock).toHaveBeenCalledWith('/ai');

    // After 1s the hook allows processing again.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    await act(async () => {
      const cb = listeners.get('navigate-to-ai-with-prompt')!;
      await cb({ payload: 'hello2' });
    });

    expect(aiStoreMock.newChat).toHaveBeenCalledTimes(2);
    expect(aiStoreMock.newChatWithSuggestion).toHaveBeenCalledTimes(2);
    expect(aiStoreMock.newChatWithSuggestion).toHaveBeenCalledWith('hello2');
  });

  it('does nothing when disabled or when runtime is unavailable', async () => {
    isDesktopMock.mockReturnValue(false);
    const { useQuickaiHotkey } = await import('../useQuickaiHotkey');

    function Comp() {
      useQuickaiHotkey(false);
      return null;
    }

    render(<Comp />);
    await act(async () => {
      await flushMicrotasks();
    });

    expect(listenMock).not.toHaveBeenCalled();
  });
});
