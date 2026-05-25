import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// Keep the component tree minimal for this behavior test.
vi.mock('../imageRender', () => ({ ImageRender: () => null }));
vi.mock('../audioRender', () => ({ AudioRender: () => null }));
vi.mock('../FileIcon', () => ({ FileIcons: ({ path }: any) => <span>{path}</span> }));
vi.mock('../icons', () => ({
  DeleteIcon: () => null,
  DownloadIcon: () => null,
}));

vi.mock('react-i18next', () => ({
  // Used by src/lib/i18n.ts during initialization in some imports.
  initReactI18next: {
    type: '3rdParty',
    init: () => {},
  },
  useTranslation: () => ({
    // Keep it deterministic and visible in assertions.
    t: (key: string, opts?: any) =>
      typeof opts?.count === 'number' ? `${key}:${opts.count}` : key,
  }),
}));

vi.mock(import('@/lib/blinkoEndpoint'), async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    getBlinkoEndpoint: (p: string) => p,
  };
});

vi.mock('../DraggableFileGrid', () => ({
  DraggableFileGrid: ({ files, renderItem, type }: any) => (
    <div>
      {files.filter((f: any) => f?.previewType === type).map((f: any) => (
        <div key={f.name} data-testid={`file-${f.name}`}>
          {renderItem(f)}
        </div>
      ))}
    </div>
  ),
}));

describe('AttachmentsRender (hide used attachments)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unmock('mobx-react-lite');
    vi.doMock('mobx-react-lite', () => ({
      observer: (c: any) => c,
    }));
  });

  it('hides attachments already referenced in noteContent by default and can show them', async () => {
    const { AttachmentsRender } = await import('../index');

    render(
      <AttachmentsRender
        files={[
          {
            name: 'a.pdf',
            size: 1,
            previewType: 'other',
            extension: 'pdf',
            preview: '/api/file/1',
            uploadPromise: { loading: { value: false }, value: '/api/file/1' } as any,
            type: 'application/pdf',
          },
          {
            name: 'b.pdf',
            size: 1,
            previewType: 'other',
            extension: 'pdf',
            preview: '/api/file/2',
            uploadPromise: { loading: { value: false }, value: '/api/file/2' } as any,
            type: 'application/pdf',
          },
        ]}
        noteContent={'hello ![a](/api/file/1)'}
      />
    );

    expect(screen.queryByTestId('file-a.pdf')).toBeNull();
    expect(screen.getByTestId('file-b.pdf')).toBeInTheDocument();

    // The toggle should appear with the used count.
    fireEvent.click(screen.getByRole('button', { name: 'show-used-attachments:1' }));

    expect(screen.getByTestId('file-a.pdf')).toBeInTheDocument();
    expect(screen.getByTestId('file-b.pdf')).toBeInTheDocument();
  }, 15_000);

  it('detects used attachments by /api/file/<id> even if the attachment has extra query params', async () => {
    const { AttachmentsRender } = await import('../index');

    render(
      <AttachmentsRender
        files={[
          {
            name: 'img.png',
            size: 1,
            previewType: 'other',
            extension: 'png',
            preview: '/api/file/532?thumbnail=true',
            uploadPromise: { loading: { value: false }, value: '/api/file/532?thumbnail=true' } as any,
            type: 'image/png',
          },
        ]}
        noteContent={'![excalidraw.png](/api/file/532)'}
      />
    );

    expect(screen.queryByTestId('file-img.png')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'show-used-attachments:1' }));
    expect(screen.getByTestId('file-img.png')).toBeInTheDocument();
  }, 15_000);
});
