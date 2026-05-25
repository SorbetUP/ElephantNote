import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/i18n', () => ({ default: { t: (k: string) => k } }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: {},
}));

vi.mock('usehooks-ts', () => ({
  useMediaQuery: () => true, // mobile
}));

vi.mock('@/components/Common/LoadingAndEmpty', () => ({
  LoadingAndEmpty: () => null,
}));

vi.mock('@/components/Common/ScrollArea', () => ({
  ScrollArea: ({ children }: any) => <div data-testid="scroll-area">{children}</div>,
}));

vi.mock('@/components/Common/Editor/Toolbar/IconButton', () => ({
  IconButton: ({ icon }: any) => <button data-testid={`iconbtn:${icon}`} type="button" />,
}));

vi.mock('@/lib/trpc', () => ({
  api: {
    conversation: {
      update: { mutate: vi.fn() },
      delete: { mutate: vi.fn() },
    },
  },
}));

vi.mock('@/store/standard/PromiseState', () => ({
  PromiseCall: async (p: any) => p,
}));

// Prevent importing real stores (they init global RootStore).
vi.mock('@/store/aiStore', () => ({ AiStore: class AiStore {} }));
vi.mock('@/store/module/Dialog', () => ({ DialogStore: class DialogStore {} }));

const stubs = vi.hoisted(() => ({
  ai: {
    conversactionList: {
      loading: { value: false },
      value: [{ id: 1, title: 't1' }],
      resetAndCall: vi.fn(),
      callNextPage: vi.fn(),
    },
    currentConversationId: null as any,
    currentConversation: { call: vi.fn() },
    isChatting: false,
  },
  dialog: { close: vi.fn() },
}));

vi.mock('@/store/root', () => ({
  RootStore: class RootStore {
    static init() {
      return new RootStore();
    }
    static Get(cls: any) {
      switch (cls?.name) {
        case 'AiStore':
          return stubs.ai;
        case 'DialogStore':
          return stubs.dialog;
        default:
          return {};
      }
    }
  },
}));

import { AiConversactionList } from './aiConversactionList';

describe('AiConversactionList (mobile actions visible)', () => {
  beforeEach(() => {
    stubs.ai.conversactionList.resetAndCall.mockClear();
  });

  it('shows actions container on mobile (not group-hover hidden)', () => {
    const { container } = render(<AiConversactionList />);

    // Actions container should use flex on mobile.
    const actions = container.querySelector('div.flex.items-center.gap-1') as HTMLElement | null;
    expect(actions).toBeTruthy();

    expect(screen.getByTestId('iconbtn:hugeicons:edit-02')).toBeTruthy();
    expect(screen.getByTestId('iconbtn:hugeicons:delete-02')).toBeTruthy();
  });
});
