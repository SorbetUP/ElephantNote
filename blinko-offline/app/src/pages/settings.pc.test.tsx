import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('@/lib/i18n', () => ({ default: { t: (k: string) => k } }));

const stubs = vi.hoisted(() => {
  return {
    isDesktop: true,
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
  useMediaQuery: () => false, // desktop layout in settings.tsx uses (max-width: 768px)
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
  ScrollableTabs: () => <div data-testid="scrollable-tabs" />,
  TabItem: {},
}));

vi.mock('@/components/BlinkoSettings/ImportAIDialog', () => ({
  ImportAIDialog: () => null,
}));

// Settings panels: not under test; keep them lightweight.
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

describe('Settings page (desktop layout)', () => {
  beforeEach(() => {
    stubs.isDesktop = true;
    stubs.isInTauri = true;
    stubs.user.isSuperAdmin = true;
    stubs.blinko.searchText = '';
  });

  it('uses a left vertical tab list on desktop and shows Hotkey settings', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Desktop layout: no top ScrollableTabs.
    expect(screen.queryByTestId('scrollable-tabs')).toBeNull();

    // Desktop layout uses a left list of buttons including Hotkeys.
    expect(screen.getByText('hotkeys')).toBeTruthy();
    expect(document.querySelector('div.w-56')).toBeTruthy();
  });
});
