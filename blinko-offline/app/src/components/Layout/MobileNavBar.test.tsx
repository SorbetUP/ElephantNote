import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/i18n', () => ({ default: { t: (k: string) => k } }));

const stubs = vi.hoisted(() => {
  const base = {
    routerList: [
      { title: 'home', href: '/', icon: 'tabler:home' },
      { title: 'blinko', href: '/blinko', icon: 'tabler:sparkles' },
      { title: 'notes', href: '/notes', icon: 'tabler:note' },
      { title: 'todo', href: '/todo', icon: 'tabler:checkbox' },
      { title: 'settings', href: '/settings', icon: 'tabler:settings' },
      // Hidden on mobile: should not appear.
      { title: 'desktop-only', href: '/desktop', icon: 'tabler:device-desktop', hiddenMobile: true },
      // Hidden in sidebar but NOT on mobile: should still appear.
      { title: 'hidden-sidebar', href: '/hidden', icon: 'tabler:eye-off', hiddenSidebar: true },
    ],
    isSideBarActive: vi.fn(() => false),
    currentRouter: null as any,
  };

  const blinko = {
    config: {
      value: {
        isHiddenMobileBar: false,
      },
    },
  };

  return {
    base,
    blinko,
    swiperVisible: true,
  };
});

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
  rootStore: {},
  useStore: () => ({}),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: {},
}));

vi.mock('@/lib/hooks', () => ({
  useSwiper: () => stubs.swiperVisible,
}));

vi.mock('@/components/Common/Iconify/icons', () => ({
  Icon: (props: any) => <span data-testid={`icon:${props.icon}`} />,
}));

// MobileNavBar imports these from "./index". Mocking avoids importing the full layout module.
vi.mock('./index', () => ({
  getFixedHeaderBackground: () => '#ffffff80',
  SideBarItem: 'sidebar-item',
}));

import { MobileNavBar } from './MobileNavBar';

describe('MobileNavBar (mobile UX)', () => {
  beforeEach(() => {
    stubs.base.isSideBarActive.mockReturnValue(false);
    stubs.blinko.config.value.isHiddenMobileBar = false;
    stubs.swiperVisible = true;
  });

  it('renders a bottom navigation bar with only non-hiddenMobile routes (routerList-driven)', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <MobileNavBar />
      </MemoryRouter>,
    );

    const bar = container.querySelector('.blinko-bottom-bar') as HTMLDivElement;
    expect(bar).toBeTruthy();
    expect(bar.className).toContain('h-[60px]');
    expect(bar.className).toContain('w-full');
    expect(bar.className).toContain('fixed');
    expect(bar.className).toContain('bottom-0');

    // Visible entries.
    expect(container.querySelector('a[href="/"]')).toBeTruthy();
    expect(container.querySelector('a[href="/blinko"]')).toBeTruthy();
    expect(container.querySelector('a[href="/notes"]')).toBeTruthy();
    expect(container.querySelector('a[href="/todo"]')).toBeTruthy();
    expect(container.querySelector('a[href="/settings"]')).toBeTruthy();
    expect(container.querySelector('a[href="/hidden"]')).toBeTruthy();

    // Hidden on mobile.
    expect(container.querySelector('a[href="/desktop"]')).toBeFalsy();

    // Icon-only buttons (no visible text).
    const settingsLink = container.querySelector('a[href="/settings"]') as HTMLAnchorElement;
    expect(settingsLink.textContent?.trim()).toBe('');
    expect(settingsLink.className).toContain('w-full');
    expect(settingsLink.className).toContain('h-full');
    expect(screen.getByTestId('icon:tabler:settings')).toBeTruthy();

    // Blurred background on the bottom bar.
    expect(bar.style.backdropFilter).toBe('blur(20px)');
  });

  it('returns null when the mobile bar is hidden via config', () => {
    stubs.blinko.config.value.isHiddenMobileBar = true;

    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <MobileNavBar />
      </MemoryRouter>,
    );

    expect(container.firstChild).toBeNull();
  });
});
