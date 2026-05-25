import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const { navigateMock, locationMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  locationMock: { pathname: '/oauth-callback', search: '' },
}));

const { toastMock, dialogMock, userStoreMock } = vi.hoisted(() => ({
  toastMock: { error: vi.fn(), loading: vi.fn(), dismiss: vi.fn(), success: vi.fn() },
  dialogMock: { close: vi.fn() },
  userStoreMock: {
    id: 'user-1',
    tokenData: {
      value: { user: { id: 'user-1' } },
      save: vi.fn(),
    },
  },
}));

const { eventBusMock } = vi.hoisted(() => ({
  eventBusMock: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

const { getTokenDataMock, signInMock } = vi.hoisted(() => ({
  getTokenDataMock: vi.fn(async () => null),
  signInMock: vi.fn(async () => ({ ok: true })),
}));

describe('OAuth callback page', () => {
  beforeEach(() => {
    // Several test files mock the same modules (react-router-dom, react-i18next, etc.).
    // Use resetModules + doMock so this test always runs with its intended mocks.
    vi.resetModules();

    vi.unmock('@/components/Common/LoadingPage');
    vi.doMock('@/components/Common/LoadingPage', () => ({
      LoadingPage: () => <div>loading</div>,
    }));

    vi.unmock('react-i18next');
    vi.doMock('react-i18next', () => ({
      useTranslation: () => ({ t: (k: string) => k }),
      initReactI18next: {},
    }));

    vi.unmock('react-router-dom');
    vi.doMock('react-router-dom', () => ({
      useNavigate: () => navigateMock,
      useLocation: () => locationMock,
    }));

    vi.unmock('@heroui/react');
    vi.doMock('@heroui/react', () => ({
      Button: ({ children, onPress, isDisabled }: any) => (
        <button type="button" disabled={!!isDisabled} onClick={onPress}>
          {children}
        </button>
      ),
    }));

    vi.doMock('@/store/module/Toast/Toast', () => ({
      ToastPlugin: class ToastPlugin {},
    }));
    vi.doMock('@/store/module/Dialog', () => ({
      DialogStore: class DialogStore {},
    }));
    vi.doMock('@/store/user', () => ({
      UserStore: class UserStore {},
    }));

    vi.unmock('@/store');
    vi.doMock('@/store', () => ({
      RootStore: {
        Get: (store: any) => {
          if (store?.name === 'ToastPlugin') return toastMock;
          if (store?.name === 'DialogStore') return dialogMock;
          if (store?.name === 'UserStore') return userStoreMock;
          return {};
        },
      },
    }));

    vi.unmock('@/lib/event');
    vi.doMock('@/lib/event', () => ({
      eventBus: eventBusMock,
    }));

    vi.unmock('@/components/Common/TwoFactorModal');
    vi.doMock('@/components/Common/TwoFactorModal', () => ({
      ShowTwoFactorModal: vi.fn(),
    }));

    vi.unmock('@/components/Auth/auth-client');
    vi.doMock('@/components/Auth/auth-client', () => ({
      getTokenData: () => getTokenDataMock(),
      signIn: (...args: any[]) => signInMock(...args),
    }));

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    navigateMock.mockClear();
    toastMock.error.mockClear();
    dialogMock.close.mockClear();
    userStoreMock.tokenData.save.mockClear();
    eventBusMock.emit.mockClear();
    eventBusMock.on.mockClear();
    eventBusMock.off.mockClear();
    getTokenDataMock.mockClear();
    signInMock.mockClear();
    locationMock.pathname = '/oauth-callback';
    locationMock.search = '';
  });

  it('renders error UI when error query param is present and navigates back to /signin', async () => {
    locationMock.search = '?error=boom';
    const Page = (await import('./oauth-callback')).default;

    render(<Page />);

    // Let the effect commit.
    await act(async () => {
      await Promise.resolve();
    });

    expect(await screen.findByText('login-failed')).toBeTruthy();
    expect(screen.getByText('boom')).toBeTruthy();

    const btn = screen.getByRole('button', { name: 'sign-in' });
    fireEvent.click(btn);

    expect(navigateMock).toHaveBeenCalledWith('/signin');
    expect(toastMock.error).toHaveBeenCalled();
  });

  it('emits token and navigates to / when success=true and token is present', async () => {
    locationMock.search = '?success=true&token=abc';
    getTokenDataMock.mockResolvedValueOnce({ user: { id: 'user-1' } });

    const Page = (await import('./oauth-callback')).default;
    render(<Page />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(eventBusMock.emit).toHaveBeenCalledWith('user:token', {
      user: { id: 'user-1' },
      token: 'abc',
    });
    expect(navigateMock).toHaveBeenCalledWith('/');
  });
});
