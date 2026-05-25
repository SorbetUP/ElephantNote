import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/i18n', () => ({ default: { t: (k: string) => k } }));

const stubs = vi.hoisted(() => ({
  base: {
    useInitApp: () => {},
    sideBarWidth: 240,
    currentTitle: 'home',
    isOnline: true,
    routerList: [],
    isSideBarActive: () => false,
  },
  blinko: {
    use: () => {},
    refreshData: () => {},
    updateTicker: 0,
    config: { value: { isCloseDailyReview: true } },
    dailyReviewNoteList: { value: [] },
  },
  user: { use: () => {} },
  ai: { currentConversation: { value: null } },
  listeners: {} as Record<string, Set<(payload?: any) => void>>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: {},
}));

vi.mock('@/components/Common/Iconify/icons', () => ({
  Icon: (props: any) => <span data-testid={`icon:${props.icon}`} />,
}));

vi.mock('@heroui/react', () => ({
  Button: ({ children, onPress, isIconOnly, ...rest }: any) => (
    <button type="button" data-testid={isIconOnly ? 'button:icon' : 'button'} onClick={onPress} {...rest}>
      {children}
    </button>
  ),
  Badge: ({ children }: any) => <div>{children}</div>,
  VisuallyHidden: ({ children }: any) => <>{children}</>,
  Chip: ({ children }: any) => <span>{children}</span>,
  useCheckbox: (props: any) => ({
    isSelected: !!props?.isSelected,
    isFocusVisible: false,
    getBaseProps: () => ({}),
    getLabelProps: () => ({ ref: null }),
    getInputProps: () => ({}),
  }),
  tv: () => () => ({ base: () => '', content: () => '' }),
}));

vi.mock('react-burger-menu', () => ({
  push: ({ children }: any) => <div data-testid="burger-menu">{children}</div>,
}));

vi.mock('usehooks-ts', () => ({
  useMediaQuery: () => true, // pc
}));

vi.mock('@/components/Layout/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}));

vi.mock('@/components/BlinkoRightClickMenu', () => ({
  BlinkoRightClickMenu: () => null,
}));

vi.mock('@/components/Common/PopoverFloat/aiWritePop', () => ({
  default: () => null,
}));

vi.mock('@/components/Common/PopoverFloat/filterPop', () => ({
  default: () => null,
}));

vi.mock('@/components/Layout/BarSearchInput', () => ({
  BarSearchInput: () => null,
}));

vi.mock('@/components/BlinkoNotification', () => ({
  BlinkoNotification: () => null,
}));

vi.mock('@/components/Layout/MobileNavBar', () => ({
  MobileNavBar: () => null,
}));

vi.mock('@/components/Common/ScrollArea', () => ({
  ScrollArea: ({ children }: any) => <div data-testid="scroll-area">{children}</div>,
}));

vi.mock('@/lib/event', () => ({
  eventBus: {
    on: (event: string, listener: (payload?: any) => void) => {
      if (!stubs.listeners[event]) {
        stubs.listeners[event] = new Set();
      }
      stubs.listeners[event].add(listener);
    },
    off: (event: string, listener: (payload?: any) => void) => {
      stubs.listeners[event]?.delete(listener);
    },
    emit: (event: string, payload?: any) => {
      stubs.listeners[event]?.forEach((listener) => listener(payload));
    },
  },
}));

vi.mock('@/store', () => ({
  RootStore: {
    Get: (cls: any) => {
      switch (cls?.name) {
        case 'BaseStore':
          return stubs.base;
        case 'BlinkoStore':
          return stubs.blinko;
        case 'UserStore':
          return stubs.user;
        case 'AiStore':
          return stubs.ai;
        default:
          return {};
      }
    },
  },
}));

import { CommonLayout } from './index';
import { eventBus } from '@/lib/event';

describe('CommonLayout (desktop)', () => {
  it('does not render react-burger-menu on desktop', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <CommonLayout>
          <div>content</div>
        </CommonLayout>
      </MemoryRouter>,
    );

    // CommonLayout returns empty on first render until it becomes "client".
    await act(async () => {});

    expect(screen.queryByTestId('burger-menu')).toBeNull();
    expect(screen.getByTestId('sidebar')).toBeTruthy();
  });

  it('hides sidebar and top header while editor fullscreen is active', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <CommonLayout>
          <div>content</div>
        </CommonLayout>
      </MemoryRouter>,
    );

    await act(async () => {});
    expect(screen.getByTestId('sidebar')).toBeTruthy();
    expect(document.querySelector('.blinko-mobile-header')).toBeTruthy();

    await act(async () => {
      eventBus.emit('editor:setFullScreen', { isFullscreen: true, editorId: 'pc-editor-1' });
    });

    expect(screen.queryByTestId('sidebar')).toBeNull();
    expect(document.querySelector('.blinko-mobile-header')).toBeNull();

    await act(async () => {
      eventBus.emit('editor:setFullScreen', { isFullscreen: false, editorId: 'pc-editor-1' });
    });

    expect(screen.getByTestId('sidebar')).toBeTruthy();
    expect(document.querySelector('.blinko-mobile-header')).toBeTruthy();
  });
});
