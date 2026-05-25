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

vi.mock('@heroui/react', () => ({
  Button: ({ children, onPress }: any) => <button type="button" onClick={onPress}>{children}</button>,
  Popover: ({ children }: any) => <div>{children}</div>,
  PopoverTrigger: ({ children }: any) => <div>{children}</div>,
  PopoverContent: ({ children }: any) => <div>{children}</div>,
  Textarea: (props: any) => <textarea {...props} />,
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

vi.mock('../Common/ScrollArea', () => ({
  ScrollArea: ({ children }: any) => <div data-testid="scroll-area">{children}</div>,
}));

vi.mock('framer-motion', () => ({
  motion: {
    // eslint-disable-next-line react/display-name
    div: (props: any) => <div {...props} />,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('../Common/MarkdownRender', () => ({
  MarkdownRender: ({ content }: any) => <div data-testid="markdown">{content}</div>,
}));

vi.mock('../BlinkoCard', () => ({
  BlinkoCard: () => null,
}));

vi.mock('../Common/Editor/Toolbar/IconButton', () => ({
  IconButton: ({ icon }: any) => <button data-testid={`iconbtn:${icon}`} type="button" />,
}));

vi.mock('copy-to-clipboard', () => ({
  default: () => true,
}));

vi.mock('@/components/Common/Iconify/icons', () => ({
  Icon: (props: any) => <span data-testid={`icon:${props.icon}`} className={props.className} />,
}));

vi.mock('@/lib/trpc', () => ({
  api: {
    conversation: {
      toggleShare: { mutate: vi.fn() },
    },
  },
}));

vi.mock('@/lib/blinkoEndpoint', () => ({
  getBlinkoEndpoint: (p: string) => p,
}));

const stubs = vi.hoisted(() => ({
  ai: {
    isAnswering: false,
    isChatting: true,
    currentConversationId: 1,
    currentMessageResult: { content: '', toolCalls: [], toolResults: [] },
    currentConversation: {
      value: {
        id: 1,
        title: 't',
        messages: [
          { id: 11, role: 'user', content: 'hi', createdAt: new Date() },
          { id: 12, role: 'assistant', content: 'hello', createdAt: new Date() },
        ],
      },
      call: vi.fn(),
    },
  },
  toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
  blinko: { upsertNote: { call: vi.fn() } },
  dialog: { close: vi.fn(), setData: vi.fn() },
}));

vi.mock('@/store', () => ({
  RootStore: {
    Get: (cls: any) => {
      switch (cls?.name) {
        case 'AiStore':
          return stubs.ai;
        case 'ToastPlugin':
          return stubs.toast;
        case 'BlinkoStore':
          return stubs.blinko;
        case 'DialogStore':
          return stubs.dialog;
        default:
          return {};
      }
    },
  },
}));

import { BlinkoChatBox } from './aiChatBox';

describe('BlinkoChatBox (mobile actions visibility)', () => {
  beforeEach(() => {
    // jsdom doesn't provide IntersectionObserver; BlinkoChatBox uses it to detect
    // whether the bottom anchor is visible.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    stubs.ai.currentConversation.value.messages = [
      { id: 11, role: 'user', content: 'hi', createdAt: new Date() },
      { id: 12, role: 'assistant', content: 'hello', createdAt: new Date() },
    ] as any;
  });

  it('renders message action toolbars with mobile opacity (not hover-hidden)', () => {
    const { container } = render(<BlinkoChatBox />);

    // Both user + assistant action wrappers should use opacity-70 on mobile.
    const wrappers = Array.from(container.querySelectorAll('div.opacity-70'));
    expect(wrappers.length).toBeGreaterThanOrEqual(1);

    // Ensure the desktop-only opacity-0 + group-hover pattern is not required for mobile.
    expect(container.querySelector('div.opacity-0.group-hover\\:opacity-100')).toBeNull();
  });
});
