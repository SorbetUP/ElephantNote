import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const openFromLinkInDefaultAppMock = vi.fn();

// Keep the component tree minimal for this focused behavior test.
vi.mock('../imageRender', () => ({ ImageRender: () => null }));
vi.mock('../audioRender', () => ({ AudioRender: () => null }));
vi.mock('../FileIcon', () => ({ FileIcons: ({ path }: any) => <span>{path}</span> }));
vi.mock('../icons', () => ({
  DeleteIcon: () => null,
  DownloadIcon: () => null,
}));

vi.mock('../DraggableFileGrid', () => ({
  DraggableFileGrid: ({ files, renderItem }: any) => (
    <div>
      {files.map((f: any) => (
        <div key={f.name} data-testid={`file-${f.name}`}>
          {renderItem(f)}
        </div>
      ))}
    </div>
  ),
}));

describe('AttachmentsRender (documents)', () => {
  beforeEach(() => {
    // This test relies on per-file module mocks; make sure module cache from other test files
    // doesn't leak into this one when Vitest reuses workers.
    vi.resetModules();

    // Several test files mock these modules; use doMock so this file's overrides win.
    vi.unmock('mobx-react-lite');
    vi.doMock('mobx-react-lite', () => ({
      observer: (c: any) => c,
    }));

    // Avoid pulling in the real app store/UI libs (and any of their side effects) for this focused test.
    vi.unmock('@/store');
    vi.doMock('@/store', () => ({
      RootStore: {
        Get: () => ({ tokenData: { value: { token: '' } } }),
      },
    }));
    vi.unmock('@/store/user');
    vi.doMock('@/store/user', () => ({
      UserStore: class UserStore {},
    }));
    vi.unmock('@heroui/popover');
    vi.doMock('@heroui/popover', () => ({
      Popover: ({ children }: any) => <div>{children}</div>,
      PopoverTrigger: ({ children }: any) => <div>{children}</div>,
      PopoverContent: ({ children }: any) => <div>{children}</div>,
    }));
    vi.unmock('@/components/BlinkoCard');
    vi.doMock('@/components/BlinkoCard', () => ({ BlinkoCard: () => null }));
    vi.unmock('@/components/Common/Iconify/icons');
    vi.doMock('@/components/Common/Iconify/icons', () => ({ Icon: () => null }));

    // Avoid i18n suspense/network loading in tests.
    vi.unmock('react-i18next');
    vi.doMock('react-i18next', () => ({
      initReactI18next: { type: '3rdParty', init: () => {} },
      useTranslation: () => ({ t: (k: string) => k }),
    }));

    vi.unmock('@/lib/tauriHelper');
    vi.doMock('@/lib/tauriHelper', () => ({
      openFromLinkInDefaultApp: (...args: any[]) => openFromLinkInDefaultAppMock(...args),
    }));

    openFromLinkInDefaultAppMock.mockClear();
  });

  it('on preview click, opens non-media attachments with system default app', async () => {
    const { AttachmentsRender } = await import('../index');

    render(
      <AttachmentsRender
        preview
        files={[
          {
            name: 'doc.pdf',
            size: 1,
            previewType: 'other',
            extension: 'pdf',
            preview: '/api/file/196',
            uploadPromise: { loading: { value: false }, value: '/api/file/196' } as any,
            type: 'application/pdf',
          },
        ]}
      />
    );

    const wrapper = screen.getByTestId('file-doc.pdf');
    fireEvent.click(wrapper.firstElementChild as HTMLElement);
    expect(openFromLinkInDefaultAppMock).toHaveBeenCalledWith('/api/file/196', 'doc.pdf');
  }, 10000);
});
