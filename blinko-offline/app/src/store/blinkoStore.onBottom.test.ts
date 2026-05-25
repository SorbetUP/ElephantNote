import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/trpc', () => ({
  api: {},
  streamApi: {}
}));

vi.mock('@/lib/i18n', () => ({ default: { t: (k: string) => k } }));

import { BlinkoStore } from './blinkoStore';

describe('BlinkoStore.onBottom', () => {
  it('loads next page for path=all (does not reset to page 1)', async () => {
    const store: any = Object.create(BlinkoStore.prototype);
    store.noteOnlyList = { callNextPage: vi.fn() };
    store.todoList = { callNextPage: vi.fn() };
    store.archivedList = { callNextPage: vi.fn() };
    store.trashList = { callNextPage: vi.fn() };
    store.noteList = { callNextPage: vi.fn(), resetAndCall: vi.fn() };
    store.blinkoList = { callNextPage: vi.fn() };

    window.history.pushState({}, '', '/?path=all');
    await store.onBottom();

    expect(store.noteList.callNextPage).toHaveBeenCalledTimes(1);
    expect(store.noteList.resetAndCall).not.toHaveBeenCalled();
  });

  it('loads next page for default path (blinkoList)', async () => {
    const store: any = Object.create(BlinkoStore.prototype);
    store.noteOnlyList = { callNextPage: vi.fn() };
    store.todoList = { callNextPage: vi.fn() };
    store.archivedList = { callNextPage: vi.fn() };
    store.trashList = { callNextPage: vi.fn() };
    store.noteList = { callNextPage: vi.fn(), resetAndCall: vi.fn() };
    store.blinkoList = { callNextPage: vi.fn() };

    window.history.pushState({}, '', '/');
    await store.onBottom();

    expect(store.blinkoList.callNextPage).toHaveBeenCalledTimes(1);
  });
});

