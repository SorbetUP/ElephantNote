import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Keep PromisePageState tests isolated from app runtime stores.
vi.mock('../root', () => {
  const toast = { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() };
  const base = { isOnline: true };

  return {
    RootStore: {
      Get: (store: any) => {
        if (store?.name === 'ToastPlugin') return toast;
        if (store?.name === 'BaseStore') return base;
        return {};
      },
      init: () => ({ add: vi.fn() })
    }
  };
});

vi.mock('../module/Toast/Toast', () => ({ ToastPlugin: class ToastPlugin {} }));
vi.mock('../baseStore', () => ({ BaseStore: class BaseStore {} }));
vi.mock('@/lib/event', () => ({ eventBus: { emit: vi.fn() } }));
vi.mock('@/lib/blinkoEndpoint', () => ({
  getBlinkoEndpoint: () => '',
  isTauriAndEndpointUndefined: () => false
}));
vi.mock('../blinkoStore', () => ({ BlinkoStore: class BlinkoStore {} }));
vi.mock('@/lib/i18n', () => ({ default: { t: (k: string) => k } }));

import { PromisePageState } from './PromiseState';

describe('PromisePageState pagination merge', () => {
  beforeEach(() => {
    // Ensure deterministic page size for tests.
    window.localStorage.removeItem('pageSize');
  });

  afterEach(() => {
    window.localStorage.removeItem('pageSize');
  });

  it('dedups by id incrementally when appending pages', async () => {
    const state = new PromisePageState({
      autoAlert: false,
      function: async ({ page, size }) => {
        expect(size).toBe(2);
        if (page === 1) return [{ id: 1 }, { id: 2 }];
        if (page === 2) return [{ id: 2 }, { id: 3 }];
        return [];
      }
    });

    state.size.setValue(2);

    await state.resetAndCall({});
    await state.callNextPage({});

    expect(state.value?.map((x: any) => x.id)).toEqual([1, 2, 3]);
  });

  it('resets internal seen-id cache on resetAndCall', async () => {
    let phase = 0;
    const state = new PromisePageState({
      autoAlert: false,
      function: async ({ page }) => {
        if (phase === 0) {
          if (page === 1) return [{ id: 1 }, { id: 2 }];
          if (page === 2) return [{ id: 2 }, { id: 3 }];
        } else {
          if (page === 1) return [{ id: 2 }, { id: 4 }];
          if (page === 2) return [{ id: 4 }, { id: 5 }];
        }
        return [];
      }
    });
    state.size.setValue(2);

    await state.resetAndCall({});
    await state.callNextPage({});
    expect(state.value?.map((x: any) => x.id)).toEqual([1, 2, 3]);

    phase = 1;
    await state.resetAndCall({});
    await state.callNextPage({});
    expect(state.value?.map((x: any) => x.id)).toEqual([2, 4, 5]);
  });

  it('falls back to plain append when items have no stable id', async () => {
    const state = new PromisePageState({
      autoAlert: false,
      function: async ({ page }) => {
        if (page === 1) return [{ a: 1 }, { a: 2 }];
        if (page === 2) return [{ a: 2 }, { a: 3 }];
        return [];
      }
    });
    state.size.setValue(2);

    await state.resetAndCall({});
    await state.callNextPage({});

    expect(state.value).toEqual([{ a: 1 }, { a: 2 }, { a: 2 }, { a: 3 }]);
  });
});
