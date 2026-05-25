import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { SyncSetting } from './SyncSetting';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('@/lib/tauriHelper', () => ({
  isInTauri: () => true,
}));

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => invokeMock(...args),
}));

let settingsFixture: any = null;
let conflictsFixture: { unresolved_count: number; conflicts: any[] } = {
  unresolved_count: 0,
  conflicts: [],
};

const eventBusStubs = vi.hoisted(() => ({
  on: vi.fn(),
  off: vi.fn(),
}));
vi.mock('@/lib/event', () => ({
  eventBus: eventBusStubs,
}));

vi.mock('@/components/Common/TipsDialog', () => ({
  showTipsDialog: vi.fn(),
}));

vi.mock('@/lib/blinkoEndpoint', () => ({
  saveBlinkoEndpoint: vi.fn(),
}));

vi.mock('@/components/Common/MarkdownRender', () => ({
  MarkdownRender: ({ content }: any) => <div data-testid="markdown">{content}</div>,
}));

vi.mock('@/store/module/DialogStandalone', () => ({
  DialogStandaloneStore: class DialogStandaloneStore {},
}));

vi.mock('@/store', () => ({
  RootStore: {
    Get: () => ({ close: vi.fn() }),
  },
}));

vi.mock('@heroui/react', () => ({
  Button: ({ children, onPress, isLoading, isDisabled }: any) => (
    <button type="button" disabled={!!isLoading || !!isDisabled} onClick={onPress}>
      {children}
    </button>
  ),
  Input: ({ label, value, onChange, placeholder, type }: any) => (
    <label>
      <span>{label}</span>
      <input
        aria-label={label}
        placeholder={placeholder}
        value={value ?? ''}
        type={type || 'text'}
        onChange={onChange}
      />
    </label>
  ),
  Switch: ({ isSelected, onValueChange, children }: any) => (
    <label>
      <input
        aria-label={typeof children === 'string' ? children : 'switch'}
        type="checkbox"
        checked={!!isSelected}
        onChange={(e) => onValueChange(e.target.checked)}
      />
      <span>{children}</span>
    </label>
  ),
  Select: ({ label, selectedKeys, onSelectionChange, children, isDisabled }: any) => (
    <label>
      <span>{label}</span>
      <select
        aria-label={label}
        disabled={!!isDisabled}
        value={Array.from(selectedKeys || [])[0] ?? ''}
        onChange={(e) => onSelectionChange(new Set([e.target.value]))}
      >
        {children}
      </select>
    </label>
  ),
  SelectItem: ({ children, value }: any) => <option value={value ?? children}>{children}</option>,
  Modal: ({ isOpen, children }: any) => (isOpen ? <div data-testid="modal">{children}</div> : null),
  ModalContent: ({ children }: any) => <div data-testid="modal-content">{children}</div>,
  ModalHeader: ({ children }: any) => <div data-testid="modal-header">{children}</div>,
  ModalBody: ({ children }: any) => <div data-testid="modal-body">{children}</div>,
  ModalFooter: ({ children }: any) => <div data-testid="modal-footer">{children}</div>,
}));

describe('SyncSetting (multi-endpoints)', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    eventBusStubs.on.mockReset();
    eventBusStubs.off.mockReset();
    (globalThis as any).fetch = vi.fn();
    settingsFixture = {
      mode: 'sync',
      allow_insecure_http: false,
      sync_auto: true,
      sync_interval_secs: 300,
      remote_endpoints: [
        { id: 'a', url: 'https://a.example', token: 'tok-a' },
        { id: 'b', url: 'https://b.example', token: 'tok-b' },
      ],
    };
    conflictsFixture = { unresolved_count: 0, conflicts: [] };

    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'get_local_api_base_url') return Promise.resolve('http://127.0.0.1:61164');
      if (cmd === 'get_local_api_token') return Promise.resolve('local-api-token');
      return Promise.resolve(null);
    });

    const fetchMock = vi.mocked(globalThis.fetch as any);
    fetchMock.mockImplementation(async (input: any, init: any = {}) => {
      const url = String(input);
      const method = (init?.method || 'GET').toUpperCase();

      if (url.endsWith('/sync/settings') && method === 'GET') {
        return new Response(
          JSON.stringify(settingsFixture),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/sync/status') && method === 'GET') {
        return new Response(
          JSON.stringify({
            mode: 'sync',
            endpoints: [
              {
                id: 'a',
                url: 'https://a.example',
                last_pull_cursor: '10',
                last_push_cursor: '9',
                last_sync_at: null,
                status: 'ok',
              },
              {
                id: 'b',
                url: 'https://b.example',
                last_pull_cursor: null,
                last_push_cursor: null,
                last_sync_at: null,
                status: null,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.includes('/sync/conflicts') && method === 'GET') {
        return new Response(
          JSON.stringify(conflictsFixture),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/sync/settings') && method === 'PUT') {
        return new Response(
          JSON.stringify({ ok: true }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  });

  it('loads settings from local API and saves primary endpoint order', async () => {
    render(<SyncSetting />);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    // Ensure local API auth is used.
    const firstCall: any = (globalThis.fetch as any).mock.calls.find((c: any[]) =>
      String(c[0]).endsWith('/sync/settings'),
    );
    expect(firstCall?.[1]?.headers?.Authorization).toBe('Bearer local-api-token');

    // Select the secondary endpoint to reveal "make primary" in the details panel.
    fireEvent.click(screen.getByText('b'));

    await waitFor(() => expect(screen.getByText('sync-endpoint-make-primary')).toBeTruthy());

    fireEvent.click(screen.getByText('sync-endpoint-make-primary'));
    fireEvent.click(screen.getByText('save'));

    await waitFor(() => {
      const putCall = (globalThis.fetch as any).mock.calls.find(
        (c: any[]) => String(c[0]).endsWith('/sync/settings') && (c[1]?.method || '').toUpperCase() === 'PUT',
      );
      expect(putCall).toBeTruthy();
      const body = JSON.parse(putCall[1].body);
      expect(body.remote_endpoints[0].id).toBe('b');
      expect(body.remote_endpoints[1].id).toBe('a');
      expect(body.sync_auto).toBe(true);
      expect(body.sync_interval_secs).toBe(300);
    });
  });

  it('disables auto-sync and persists sync_auto=false', async () => {
    render(<SyncSetting />);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    const autoSyncSwitch = screen.getByLabelText('sync-auto-title');
    fireEvent.click(autoSyncSwitch);

    // Interval selector should be disabled when auto-sync is off.
    const intervalSelect = screen.getByLabelText('sync-interval');
    expect((intervalSelect as HTMLSelectElement).disabled).toBe(true);

    fireEvent.click(screen.getByText('save'));

    await waitFor(() => {
      const putCall = (globalThis.fetch as any).mock.calls.find(
        (c: any[]) => String(c[0]).endsWith('/sync/settings') && (c[1]?.method || '').toUpperCase() === 'PUT',
      );
      expect(putCall).toBeTruthy();
      const body = JSON.parse(putCall[1].body);
      expect(body.sync_auto).toBe(false);
      expect(body.sync_interval_secs).toBe(300);
    });
  });

  it('updates sync interval and persists sync_interval_secs', async () => {
    render(<SyncSetting />);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    const intervalSelect = screen.getByLabelText('sync-interval');
    fireEvent.change(intervalSelect, { target: { value: '900' } });

    fireEvent.click(screen.getByText('save'));

    await waitFor(() => {
      const putCall = (globalThis.fetch as any).mock.calls.find(
        (c: any[]) => String(c[0]).endsWith('/sync/settings') && (c[1]?.method || '').toUpperCase() === 'PUT',
      );
      expect(putCall).toBeTruthy();
      const body = JSON.parse(putCall[1].body);
      expect(body.sync_interval_secs).toBe(900);
    });
  });

  it('renders conflicts list when unresolved conflicts exist', async () => {
    conflictsFixture = {
      unresolved_count: 1,
      conflicts: [
        {
          id: 12,
          entity_type: 'note',
          entity_id: 'n1',
          created_at: '2026-02-15T20:03:02Z',
        },
      ],
    };

    render(<SyncSetting />);

    await waitFor(() => {
      expect(screen.getByText(/sync-conflicts-title/i)).toBeTruthy();
    });

    // Conflicts card title includes the count.
    expect(screen.getByText(/sync-conflicts-title.*\(1\)/)).toBeTruthy();
    // Conflict summary row.
    expect(screen.getByText('note')).toBeTruthy();
    expect(screen.getByText('n1')).toBeTruthy();
  });

  it('blocks sync actions when an endpoint token is missing', async () => {
    settingsFixture.remote_endpoints = [
      { id: 'a', url: 'https://a.example', token: '' },
      { id: 'b', url: 'https://b.example', token: 'tok-b' },
    ];

    render(<SyncSetting />);

    await waitFor(() => {
      expect(screen.getByText('sync-endpoints-title')).toBeTruthy();
    });

    // Select endpoint with missing token.
    fireEvent.click(screen.getByText('a'));

    const testBtn = screen.getByText('sync-test-connection').closest('button') as HTMLButtonElement;
    expect(testBtn.disabled).toBe(true);

    const importBtn = screen.getByText('sync-import').closest('button') as HTMLButtonElement;
    const exportBtn = screen.getByText('sync-export').closest('button') as HTMLButtonElement;
    expect(importBtn.disabled).toBe(true);
    expect(exportBtn.disabled).toBe(true);

    // Sync now is blocked when any configured endpoint is missing a token.
    const syncNowBtn = screen.getByText('sync-now').closest('button') as HTMLButtonElement;
    expect(syncNowBtn.disabled).toBe(true);

    expect(screen.getByText(/sync-token-missing-blocked/i)).toBeTruthy();
  });

  it('fills endpoint token from current session token', async () => {
    settingsFixture.remote_endpoints = [{ id: 'a', url: 'https://a.example', token: '' }];
    window.localStorage.setItem('token', 'session-token');

    render(<SyncSetting />);

    await waitFor(() => {
      expect(screen.getByText('sync-endpoints-title')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('a'));

    fireEvent.click(screen.getByText('sync-use-current-token'));

    const tokenInput = screen.getByLabelText('sync-remote-token') as HTMLInputElement;
    expect(tokenInput.value).toBe('session-token');

    const testBtn = screen.getByText('sync-test-connection').closest('button') as HTMLButtonElement;
    expect(testBtn.disabled).toBe(false);
  });
});
