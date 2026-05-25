import React, { useEffect } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const stubs = vi.hoisted(() => ({
  isInTauri: true,
  isMobile: false,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: {},
}));

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => stubs.isMobile,
}));

vi.mock('@/lib/tauriHelper', () => ({
  isInTauri: () => stubs.isInTauri,
}));

vi.mock('./SyncSetting', () => ({
  SyncSetting: ({ onSelectedEndpointChange }: any) => {
    useEffect(() => {
      onSelectedEndpointChange?.({ id: 'default', url: 'https://example.com', token: 'bearer test' });
    }, [onSelectedEndpointChange]);
    return <div data-testid="device-sync" />;
  },
}));

vi.mock('./ServerSyncSetting', () => ({
  ServerSyncPanel: (props: any) => (
    <div
      data-testid="server-sync"
      data-base={props.apiBaseUrl || ''}
      data-token={props.bearerToken || ''}
      data-disabled={props.disabledReason || ''}
    />
  ),
}));

vi.mock('./BackupSetting', () => ({
  BackupSetting: () => <div data-testid="backup-setting" />,
}));

import { UnifiedSyncSetting } from './UnifiedSyncSetting';

describe('UnifiedSyncSetting', () => {
  beforeEach(() => {
    stubs.isInTauri = true;
    stubs.isMobile = false;
  });

  it('renders only server replication on web (non-Tauri)', () => {
    stubs.isInTauri = false;
    render(<UnifiedSyncSetting />);
    expect(screen.queryByTestId('device-sync')).toBeNull();
    expect(screen.getByTestId('server-sync')).toBeTruthy();
  });

  it('passes selected endpoint base/token to ServerSyncPanel on Tauri', () => {
    stubs.isInTauri = true;
    render(<UnifiedSyncSetting />);
    expect(screen.getByTestId('device-sync')).toBeTruthy();
    const el = screen.getByTestId('server-sync');
    expect(el.getAttribute('data-base')).toBe('https://example.com');
    expect(el.getAttribute('data-token')).toBe('test');
    expect(screen.getByTestId('backup-setting')).toBeTruthy();
  });
});
