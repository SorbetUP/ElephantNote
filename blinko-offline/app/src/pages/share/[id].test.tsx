import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const publicDetailMutateMock = vi.fn();

describe('Share detail page (/share/:id)', () => {
  beforeEach(() => {
    // Ensure the dynamically imported page module is evaluated with this file's mocks,
    // even if other test files mocked the same modules in a reused worker.
    vi.resetModules();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    publicDetailMutateMock.mockReset();

    // Use doMock() so these overrides win even when Vitest reuses a worker for multiple files
    // that mock the same modules.
    vi.doMock('@/lib/i18n', () => ({
      default: { t: (k: string) => k },
    }));

    vi.doMock('react-i18next', () => ({
      useTranslation: () => ({ t: (k: string) => k }),
      initReactI18next: {},
    }));

    vi.doMock('@heroui/react', () => ({
      Card: ({ children }: any) => <div>{children}</div>,
      // Avoid ResizeObserver dependency inside the real OTP component.
      InputOtp: ({ value, onValueChange }: any) => (
        <input
          aria-label="otp"
          value={value}
          onChange={(e) => {
            const v = (e.target as HTMLInputElement).value;
            onValueChange?.(v);
          }}
        />
      ),
      Button: ({ children, onPress, isDisabled }: any) => (
        <button type="button" disabled={!!isDisabled} onClick={onPress}>
          {children}
        </button>
      ),
    }));

    vi.doMock('@/components/Common/GradientBackground', () => ({
      GradientBackground: ({ children }: any) => <div data-testid="bg">{children}</div>,
    }));

    vi.doMock('@/components/BlinkoCard', () => ({
      BlinkoCard: () => <div data-testid="blinko-card" />,
    }));

    vi.doMock('@/store', () => ({
      RootStore: {
        Local: (fn: any) => fn(),
      },
    }));

    // Keep this page test independent from the app-wide RootStore/Toast/eventBus machinery.
    vi.doMock('@/store/standard/PromiseState', () => ({
      PromiseState: class PromiseState {
        loading = { value: false };
        value: any = null;
        function: any;
        context: any;
        constructor(args: any = {}) {
          Object.assign(this, args);
        }
        async call(...args: any[]) {
          this.loading.value = true;
          try {
            const res = await this.function.apply(this.context, args);
            this.value = res;
            return res;
          } finally {
            this.loading.value = false;
          }
        }
      },
    }));

    vi.doMock('@/lib/trpc', () => ({
      api: {
        notes: {
          publicDetail: {
            mutate: (...args: any[]) => publicDetailMutateMock(...args),
          },
        },
      },
    }));
  });

  it('renders expired state when API returns expired', async () => {
    // Be resilient to double-invoked effects or retries: always return expired.
    publicDetailMutateMock.mockResolvedValue({ error: 'expired' });
    const Page = (await import('./[id]')).default;

    render(
      <MemoryRouter initialEntries={['/share/abc']}>
        <Routes>
          <Route path="/share/:id" element={<Page />} />
        </Routes>
      </MemoryRouter>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(await screen.findByText('share-link-expired')).toBeTruthy();
  });

  it('prompts for password when API indicates hasPassword and no password provided', async () => {
    // Be resilient to double-invoked effects or retries.
    publicDetailMutateMock.mockImplementation(async ({ password }: any) => {
      if (!password) return { hasPassword: true, data: null };
      if (password === '123456') return { hasPassword: false, data: { id: 1 } };
      return { hasPassword: true, data: null };
    });
    const Page = (await import('./[id]')).default;

    render(
      <MemoryRouter initialEntries={['/share/abc']}>
        <Routes>
          <Route path="/share/:id" element={<Page />} />
        </Routes>
      </MemoryRouter>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(await screen.findByText('need-password-to-access')).toBeTruthy();
    const verify = screen.getByRole('button', { name: 'verify' });
    expect(verify).toBeDisabled();

    fireEvent.change(screen.getByLabelText('otp'), { target: { value: '123456' } });
    await act(async () => {
      await Promise.resolve();
    });
    expect(verify).not.toBeDisabled();
    fireEvent.click(verify);
    expect(publicDetailMutateMock).toHaveBeenLastCalledWith({
      shareEncryptedUrl: 'abc',
      password: '123456',
    });
  });
});
