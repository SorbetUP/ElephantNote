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
  user: {
    use: () => {},
  },
  ai: {
    currentConversation: { value: null },
  },
  lastScrollClassName: '' as string,
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
  // Provide minimal exports used by transitive imports (e.g. CustomCheckbox).
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

// Burger menu wrapper.
vi.mock('react-burger-menu', () => ({
  push: ({ children }: any) => <div data-testid="burger-menu">{children}</div>,
}));

vi.mock('usehooks-ts', () => ({
  useMediaQuery: () => false, // mobile
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
  ScrollArea: ({ children, className }: any) => {
    stubs.lastScrollClassName = String(className ?? '');
    return (
      <div data-testid="scroll-area" className={className}>
        {children}
      </div>
    );
  },
}));

vi.mock('@/lib/event', () => ({
  eventBus: {
    on: () => {},
    off: () => {},
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

describe('CommonLayout (mobile burger menu)', () => {
  it('renders a hamburger button and a burger-menu sidebar on mobile', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <CommonLayout>
          <div>content</div>
        </CommonLayout>
      </MemoryRouter>,
    );

    // CommonLayout returns empty on first render until it becomes "client".
    await act(async () => {});

    expect(screen.getByTestId('burger-menu')).toBeTruthy();
    expect(screen.getByTestId('sidebar')).toBeTruthy();

    // Hamburger icon button should exist on mobile.
    expect(screen.getByTestId('icon:solar:hamburger-menu-outline')).toBeTruthy();

    // Mobile header is fixed and uses condensed padding/height.
    const header = document.querySelector('.blinko-mobile-header') as HTMLElement | null;
    expect(header).toBeTruthy();
    expect(header!.style.position).toBe('fixed');
    expect(header!.className).toContain('h-14');
    expect(header!.className).toContain('px-2');

    // Mobile scroll area leaves room for the bottom nav bar (plus safe area).
    expect(stubs.lastScrollClassName).toContain('pb-[calc(60px+env(safe-area-inset-bottom))]');
  });
});
