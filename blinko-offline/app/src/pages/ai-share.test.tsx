import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('@/lib/i18n', () => ({
  default: { t: (k: string) => k },
}));

vi.mock('@/components/BlinkoAi/aiChatBox', () => ({
  BlinkoChatBox: ({ shareMode }: any) => (
    <div data-testid="chatbox" data-share={shareMode ? '1' : '0'} />
  ),
}));

const publicDetailQueryMock = vi.fn(async (_args: any) => ({
  id: 1,
  title: 'Shared Conversation',
  createdAt: new Date().toISOString(),
  messages: [{ id: 1, content: 'hi', role: 'user', createdAt: new Date().toISOString(), metadata: {} }],
  account: { name: 'n', nickname: 'nick', image: '' },
}));
vi.mock('@/lib/trpc', () => ({
  api: {
    conversation: {
      publicDetail: {
        query: (...args: any[]) => publicDetailQueryMock(...args),
      },
    },
  },
}));

const aiStoreMock = {
  currentConversation: { value: null as any },
};
vi.mock('@/store/aiStore', () => ({
  AiStore: class AiStore {},
}));
vi.mock('@/store', () => ({
  RootStore: {
    Get: (store: any) => {
      if (store?.name === 'AiStore') return aiStoreMock;
      return {};
    },
  },
}));

vi.mock('@/lib/blinkoEndpoint', () => ({
  getBlinkoEndpoint: (p: string) => p,
}));

describe('AI share page (/ai-share/:id)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    publicDetailQueryMock.mockClear();
    aiStoreMock.currentConversation.value = null;
  });

  it('renders shared conversation and sets aiStore.currentConversation', async () => {
    const Page = (await import('./ai-share')).default;

    render(
      <MemoryRouter initialEntries={['/ai-share/abc']}>
        <Routes>
          <Route path="/ai-share/:id" element={<Page />} />
        </Routes>
      </MemoryRouter>,
    );

    await act(async () => {
      // wait for effect
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(await screen.findByText('Shared Conversation')).toBeTruthy();
    const chat = await screen.findByTestId('chatbox');
    expect(chat.getAttribute('data-share')).toBe('1');
    expect(aiStoreMock.currentConversation.value).toBeTruthy();
  });
});

