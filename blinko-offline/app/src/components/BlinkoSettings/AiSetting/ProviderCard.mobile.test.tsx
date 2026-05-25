import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/lib/i18n', () => ({ default: { t: (k: string) => k } }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: {},
}));

vi.mock('usehooks-ts', () => ({
  useMediaQuery: () => true, // mobile
}));

vi.mock('@/components/Common/Iconify/icons', () => ({
  Icon: (props: any) => <span data-testid={`icon:${props.icon}`} className={props.className} />,
}));

vi.mock('@heroui/react', () => ({
  Card: ({ children, className }: any) => <div data-testid="card" className={className}>{children}</div>,
  CardBody: ({ children }: any) => <div data-testid="card-body">{children}</div>,
  Button: ({ children, onPress, className, isIconOnly, startContent }: any) => (
    <button type="button" data-testid={isIconOnly ? 'button:icon' : 'button'} className={className} onClick={onPress}>
      {startContent}{children}
    </button>
  ),
  Chip: ({ children }: any) => <span data-testid="chip">{children}</span>,
  Select: ({ children, className }: any) => <div data-testid="select" className={className}>{children}</div>,
  SelectItem: ({ children }: any) => <div data-testid="select-item">{children}</div>,
  // Provide minimal exports used by transitive imports (e.g. CustomCheckbox).
  VisuallyHidden: ({ children }: any) => <>{children}</>,
  useCheckbox: (props: any) => ({
    isSelected: !!props?.isSelected,
    isFocusVisible: false,
    getBaseProps: () => ({}),
    getLabelProps: () => ({ ref: null }),
    getInputProps: () => ({}),
  }),
  tv: () => () => ({ base: () => '', content: () => '' }),
}));

vi.mock('@/components/BlinkoSettings/AiSetting/AIIcon', () => ({
  ProviderIcon: () => <span data-testid="provider-icon" />,
  ModelIcon: () => <span data-testid="model-icon" />,
}));

vi.mock('./ProviderDialogContent', () => ({ default: () => null }));
vi.mock('./ModelDialogContent', () => ({ default: () => null }));

vi.mock('@/components/Common/TipsDialog', () => ({
  showTipsDialog: () => {},
}));

vi.mock('@/lib/trpc', () => ({
  api: { ai: { testConnect: { mutate: vi.fn() } } },
}));

const stubs = vi.hoisted(() => ({
  aiSetting: {
    inferModelCapabilities: () => ({ inference: true }),
    deleteProvider: { call: vi.fn() },
    deleteModel: { call: vi.fn() },
  },
  dialog: { setData: vi.fn() },
  dialogStandalone: { close: vi.fn() },
  toast: { promise: vi.fn() },
}));

vi.mock('@/store', () => ({
  RootStore: {
    Get: (cls: any) => {
      switch (cls?.name) {
        case 'AiSettingStore':
          return stubs.aiSetting;
        case 'DialogStore':
          return stubs.dialog;
        case 'DialogStandaloneStore':
          return stubs.dialogStandalone;
        case 'ToastPlugin':
          return stubs.toast;
        default:
          return {};
      }
    },
  },
}));

import ProviderCard from './ProviderCard';

describe('ProviderCard (mobile layout)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('uses stacked (flex-col) provider header layout on mobile', () => {
    const { container } = render(
      <ProviderCard
        provider={{
          id: 1,
          title: 'OpenAI',
          provider: 'openai',
          baseURL: 'https://api.example.com',
          models: [],
          config: {},
        } as any}
      />,
    );

    // Provider header wrapper includes mobile flex-col marker.
    const header = container.querySelector('div.flex.flex-col') as HTMLElement | null;
    expect(header).toBeTruthy();
  });

  it('renders model cards in a mobile-stacked layout with actions visible (not group-hover hidden)', () => {
    const { container } = render(
      <ProviderCard
        provider={{
          id: 1,
          title: 'OpenAI',
          provider: 'openai',
          baseURL: 'https://api.example.com',
          config: {},
          models: [
            {
              id: 10,
              providerId: 1,
              title: 'gpt-4o',
              modelKey: 'gpt-4o',
              capabilities: { inference: true },
            },
          ],
        } as any}
      />,
    );

    // Mobile model wrapper uses block layout.
    expect(container.querySelector('div.block')).toBeTruthy();

    // Desktop-only actions wrapper should not appear in mobile layout.
    expect(container.querySelector('div.opacity-0.group-hover\\:opacity-100')).toBeNull();

    // Action icon buttons exist.
    const icons = container.querySelectorAll('[data-testid^="icon:"]');
    expect(icons.length).toBeGreaterThan(0);
  });
});
