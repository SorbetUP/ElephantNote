import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

const openFromLinkInDefaultAppMock = vi.fn();

vi.mock('mobx-react-lite', () => ({
  observer: (c: any) => c,
}));

vi.mock('@/lib/tauriHelper', () => ({
  isInTauri: () => true,
  openFromLinkInDefaultApp: (...args: any[]) => openFromLinkInDefaultAppMock(...args),
}));

vi.mock('@/store', () => ({
  RootStore: {
    Local: (fn: any) => fn(),
  },
}));

vi.mock('@/store/standard/StorageState', () => ({
  StorageState: class StorageState<T> {
    value: T | null;
    constructor({ default: def }: any) {
      this.value = def;
    }
    setValue(v: any) {
      this.value = v;
    }
  },
}));

vi.mock('@/lib/trpc', () => ({
  api: {
    public: {
      linkPreview: {
        query: vi.fn(async () => ({ title: 't', description: 'd' })),
      },
    },
  },
}));

// UI libs not needed for this test.
vi.mock('@heroui/react', () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  Image: () => null,
  Popover: ({ children }: any) => <div>{children}</div>,
  PopoverTrigger: ({ children }: any) => <div>{children}</div>,
  PopoverContent: ({ children }: any) => <div>{children}</div>,
}));

describe('LinkPreview (documents)', () => {
  beforeEach(() => {
    openFromLinkInDefaultAppMock.mockClear();
    window.open = vi.fn();
  });

  it('opens PDFs with system default app when in Tauri', async () => {
    const { LinkPreview } = await import('../LinkPreview');

    const { getByText } = render(
      <LinkPreview href="https://example.com/test.pdf" text="test.pdf" isBlock />
    );

    fireEvent.click(getByText('test.pdf'));
    expect(openFromLinkInDefaultAppMock).toHaveBeenCalledWith('https://example.com/test.pdf');
    expect(window.open).not.toHaveBeenCalled();
  });
});

