import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const stubs = vi.hoisted(() => {
  return {
    isDesktop: false,
    blinko: {
      isCreateMode: false,
      noteContent: '',
      noteTypeDefault: 0,
      forceQuery: 0,
      updateTicker: 0,
      curSelectedNote: null as any,
      createContentStorage: { value: null as any, save: vi.fn(), clear: vi.fn() },
      editContentStorage: { list: [] as any[], save: vi.fn(), push: vi.fn(), remove: vi.fn() },
      createAttachmentsStorage: { list: [] as any[], clear: vi.fn() },
      editAttachmentsStorage: { list: [] as any[], remove: vi.fn() },
      upsertNote: { loading: { value: false }, call: vi.fn() },
    },
  };
});

vi.mock('@/store', () => ({
  RootStore: {
    Get: (cls: any) => {
      switch (cls?.name) {
        case 'BlinkoStore':
          return stubs.blinko;
        default:
          return {};
      }
    },
    Local: (factory: any) => factory(),
  },
}));

vi.mock('@/lib/tauriHelper', () => ({
  isDesktop: () => stubs.isDesktop,
}));

// Avoid initializing the real Vditor editor tree; we only care about the wrapper attributes.
vi.mock('../../Common/Editor', () => ({
  default: () => <div data-testid="mock-editor" />,
}));

import { BlinkoEditor } from '../index';

describe('BlinkoEditor drag region', () => {
  beforeEach(() => {
    stubs.isDesktop = false;
  });

  it('does not set data-tauri-drag-region on mobile', () => {
    const { container } = render(
      <MemoryRouter>
        <BlinkoEditor mode="create" />
      </MemoryRouter>,
    );
    const root = container.querySelector('#global-editor');
    expect(root).toBeTruthy();
    expect(root?.getAttribute('data-tauri-drag-region')).toBeNull();
  });

  it('sets data-tauri-drag-region on desktop', () => {
    stubs.isDesktop = true;
    const { container } = render(
      <MemoryRouter>
        <BlinkoEditor mode="create" />
      </MemoryRouter>,
    );
    const root = container.querySelector('#global-editor');
    expect(root).toBeTruthy();
    expect(root?.getAttribute('data-tauri-drag-region')).not.toBeNull();
  });
});

