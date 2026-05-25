import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { BaseStore } from '@/store/baseStore';
import { Sidebar } from './Sidebar';

vi.mock('@/lib/i18n', () => ({ default: { t: (k: string) => k } }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: {},
}));

vi.mock('@/components/Common/Iconify/icons', () => ({
  Icon: (props: any) => <span data-testid={`icon:${props.icon}`} className={props.className} />,
}));

vi.mock('@heroui/react', () => ({
  Button: ({ children, onPress, className, isIconOnly }: any) => (
    <button
      type="button"
      data-testid={isIconOnly ? 'button:icon' : 'button'}
      className={className}
      onClick={onPress}
    >
      {children}
    </button>
  ),
  ScrollShadow: ({ children, className }: any) => (
    <div data-testid="scroll-shadow" className={className}>
      {children}
    </div>
  ),
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

vi.mock('../Common/UserAvatarDropdown', () => ({
  UserAvatarDropdown: () => <div data-testid="user-avatar-dropdown" />,
}));

vi.mock('../Common/TagListPanel', () => ({
  TagListPanel: () => <div data-testid="tag-list-panel" />,
}));

const stubs = vi.hoisted(() => ({
  base: null as null | BaseStore,
  blinko: null as any,
  navigate: vi.fn(),
  emit: vi.fn(),
}));

vi.mock('@/lib/event', () => ({
  eventBus: {
    emit: (...args: any[]) => stubs.emit(...args),
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
        default:
          return {};
      }
    },
  },
}));

vi.mock('usehooks-ts', () => ({
  useMediaQuery: () => false,
}));

vi.mock('react-router-dom', async () => {
  const actual: any = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => stubs.navigate,
  };
});

describe('Sidebar (mobile behaviors)', () => {
  beforeEach(() => {
    localStorage.clear();
    stubs.navigate.mockReset();
    stubs.emit.mockReset();

    stubs.base = new BaseStore();
    stubs.base.routerList = [
      { title: 'home', href: '/', icon: 'tabler:home' } as any,
      { title: 'settings', href: '/settings', icon: 'tabler:settings' } as any,
    ];

    stubs.blinko = {
      tagList: { value: { listTags: [] as any[] } },
    };
  });

  it('renders expanded drawer navigation on mobile and uses full width (no resize handle)', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar />
      </MemoryRouter>,
    );

    const root = container.firstElementChild as HTMLDivElement;
    expect(root).toBeTruthy();
    expect(root.style.width).toBe('100%');

    // On mobile drawer, we always render expanded and never show the resize handle.
    expect(container.querySelector('div.cursor-col-resize')).toBeNull();

    // Do not auto-mutate the persisted desktop sidebar state.
    expect(localStorage.getItem('sidebar-collapsed')).toBeNull();

    // Labels should be visible in drawer mode (not icon-only).
    expect(screen.getByText('home')).toBeTruthy();
  });

  it('shows a settings button in the sidebar header on mobile and closes the sidebar', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar />
      </MemoryRouter>,
    );

    // Mobile header button navigates to settings and emits close-sidebar.
    const iconButtons = screen.getAllByTestId('button:icon');
    expect(iconButtons.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(iconButtons[0]!);

    expect(stubs.navigate).toHaveBeenCalledWith('/settings');
    expect(stubs.emit).toHaveBeenCalledWith('close-sidebar');
  });
});
