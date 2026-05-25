import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/lib/i18n', () => ({ default: { t: (k: string) => k } }));

vi.mock('@/lib/notePrivacy', () => ({
  isCredentialsNote: () => false,
  maskCredentialsContent: (s: string) => s,
}));

vi.mock('@/components/Common/MarkdownRender', () => ({
  MarkdownRender: ({ content, onChange }: any) => (
    <div>
      <div data-testid="md">{content}</div>
      {onChange && (
        <button type="button" data-testid="md:edit" onClick={() => onChange('updated')}>
          edit
        </button>
      )}
    </div>
  ),
}));

vi.mock('../Common/AttachmentRender', () => ({
  FilesAttachmentRender: () => null,
}));

vi.mock('./referencesContent', () => ({
  ReferencesContent: () => null,
}));

import { NoteContent } from './noteContent';

describe('NoteContent (external card rendering updates)', () => {
  it('rerenders when content changes and can trigger an upsert on edit (non-share mode)', () => {
    const upsert = { call: vi.fn() };
    const blinkoItem: any = { id: 1, content: 'initial', attachments: [] };

    const { rerender } = render(
      <NoteContent blinkoItem={blinkoItem} blinko={{ upsertNote: upsert } as any} />,
    );
    expect(screen.getByTestId('md').textContent).toBe('initial');

    // Simulate markdown edit which should update model + call upsert.
    fireEvent.click(screen.getByTestId('md:edit'));
    expect(upsert.call).toHaveBeenCalledWith({ id: 1, content: 'updated', refresh: false });

    // Simulate store updated content reflected in UI on re-render.
    blinkoItem.content = 'updated';
    rerender(<NoteContent blinkoItem={blinkoItem} blinko={{ upsertNote: upsert } as any} />);
    expect(screen.getByTestId('md').textContent).toBe('updated');
  });
});

