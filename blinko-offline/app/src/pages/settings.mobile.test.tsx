import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('@/lib/i18n', () => ({ default: { t: (k: string) => k } }));

const stubs = vi.hoisted(() => {
  return {
    isMobile: true,
    isDesktop: false,
    isInTauri: true,
    user: {
      isSuperAdmin: true,
    },
    blinko: {
      searchText: '',
    },
  };
});

vi.mock('@/store', () => ({
  RootStore: {
    Get: (cls: any) => {
      switch (cls?.name) {
        case 'UserStore':
          return stubs.user;
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

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => stubs.isMobile,
}));

vi.mock('@/lib/tauriHelper', () => ({
  isDesktop: () => stubs.isDesktop,
  isInTauri: () => stubs.isInTauri,
}));

vi.mock('@/components/Common/Iconify/icons', () => ({
  Icon: (props: any) => <span data-testid={`icon:${props.icon}`} />,
}));

vi.mock('@/components/Common/ScrollArea', () => ({
  ScrollArea: ({ children }: any) => <div data-testid="scroll-area">{children}</div>,
}));

vi.mock('@/components/Common/ScrollableTabs', () => ({
  ScrollableTabs: ({ items, selectedKey }: any) => (
    <div data-testid="scrollable-tabs" data-selected={selectedKey}>
      {items.map((i: any) => (
        <div key={i.key} data-testid={`tab:${i.key}`}>[{i.key}]</div>
      ))}
    </div>
  ),
  TabItem: {},
}));

vi.mock('@/components/BlinkoSettings/ImportAIDialog', () => ({
  ImportAIDialog: () => null,
}));

// Settings panels: not under test here; keep them lightweight.
vi.mock('@/components/BlinkoSettings/BasicSetting', () => ({ BasicSetting: () => <div /> }));
vi.mock('@/components/BlinkoSettings/PerferSetting', () => ({ PerferSetting: () => <div /> }));
vi.mock('@/components/BlinkoSettings/TaskSetting', () => ({ TaskSetting: () => <div /> }));
vi.mock('@/components/BlinkoSettings/ImportSetting', () => ({ ImportSetting: () => <div /> }));
vi.mock('@/components/BlinkoSettings/UserSetting', () => ({ UserSetting: () => <div /> }));
vi.mock('@/components/BlinkoSettings/AboutSetting', () => ({ AboutSetting: () => <div /> }));
vi.mock('@/components/BlinkoSettings/StorageSetting', () => ({ StorageSetting: () => <div /> }));
vi.mock('@/components/BlinkoSettings/ExportSetting', () => ({ ExportSetting: () => <div /> }));
vi.mock('@/components/BlinkoSettings/MusicSetting', () => ({ MusicSetting: () => <div /> }));
vi.mock('@/components/BlinkoSettings/SSOSetting', () => ({ SSOSetting: () => <div /> }));
vi.mock('@/components/BlinkoSettings/HttpProxySetting', () => ({ HttpProxySetting: () => <div /> }));
vi.mock('@/components/BlinkoSettings/PluginSetting', () => ({ PluginSetting: () => <div /> }));
vi.mock('@/components/BlinkoSettings/HotkeySetting', () => ({ HotkeySetting: () => <div /> }));
vi.mock('@/components/BlinkoSettings/UnifiedSyncSetting', () => ({ UnifiedSyncSetting: () => <div /> }));
vi.mock('@/components/BlinkoSettings/AiSetting/AiSetting', () => ({ default: () => <div /> }));

import SettingsPage from './settings';

describe('Settings page (mobile layout)', () => {
  beforeEach(() => {
    stubs.isMobile = true;
    stubs.isDesktop = false;
    stubs.isInTauri = true;
    stubs.user.isSuperAdmin = true;
    stubs.blinko.searchText = '';
  });

  it('uses a sticky, scrollable top tab bar on mobile and adds extra top padding', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('scrollable-tabs')).toBeTruthy();

    // Extra top padding (spacer) above the tabs in the mobile header area.
    expect(container.querySelector('div.h-16')).toBeTruthy();

    // Sticky top bar wrapper.
    expect(container.querySelector('div.sticky.top-0')).toBeTruthy();
  });

  it('hides Hotkey settings on mobile platforms (desktop-only)', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByTestId('tab:hotkey')).toBeNull();
    // Server Sync is merged into Sync on mobile.
    expect(screen.queryByTestId('tab:server-sync')).toBeNull();
    // Sanity: a few non-desktop tabs remain.
    expect(screen.getByTestId('tab:basic')).toBeTruthy();
    expect(screen.getByTestId('tab:prefer')).toBeTruthy();
  });
});
