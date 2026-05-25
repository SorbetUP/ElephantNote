import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { MemoizedResourceItem } from './ResourceItem';

vi.mock('@/lib/i18n', () => ({ default: { t: (k: string) => k } }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: {},
}));

vi.mock('@/components/Common/Iconify/icons', () => ({
  Icon: (props: any) => <span data-testid={`icon:${props.icon}`} />,
}));

vi.mock('@heroui/react', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    Card: ({ children }: any) => <div data-testid="card">{children}</div>,
    Checkbox: ({ isSelected, onChange }: any) => (
      <input
        data-testid="checkbox"
        type="checkbox"
        checked={!!isSelected}
        onChange={() => onChange?.(!isSelected)}
      />
    ),
    Tooltip: ({ children }: any) => <>{children}</>,
  };
});

vi.mock('react-photo-view', () => ({
  PhotoView: ({ src, children }: any) => (
    <div data-testid="photoview" data-src={String(src)}>
      {children}
    </div>
  ),
}));

vi.mock('@/components/Common/AttachmentRender/imageRender', () => ({
  ImageThumbnailRender: ({ src }: any) => <img data-testid="thumb" alt="thumb" data-src={String(src)} />,
}));

vi.mock('@/lib/blinkoEndpoint', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getBlinkoEndpoint: (path: string) => (path.startsWith('http') ? path : `http://127.0.0.1:38977${path}`),
  };
});

const stubs = vi.hoisted(() => ({
  token: 'local-token',
}));

vi.mock('@/store/user', () => ({
  UserStore: class UserStore {},
}));

vi.mock('@/store/resourceStore', () => ({
  ResourceStore: class ResourceStore {},
}));

vi.mock('@/store', () => ({
  RootStore: {
    Get: (cls: any) => {
      if (cls?.name === 'UserStore') {
        return { tokenData: { value: { token: stubs.token } } };
      }
      if (cls?.name === 'ResourceStore') {
        return { setContextMenuResource: () => {} };
      }
      return {};
    },
  },
}));

describe('ResourceItem (Android image open)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('wraps image rows in PhotoView with a tokenized URL and does not use window.open', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null as any);

    render(
      <MemoryRouter initialEntries={['/resources']}>
        <MemoizedResourceItem
          dndEnabled={false}
          item={{ id: 1, name: 'pic.png', path: '/api/file/1', type: 'image/png', size: 12, createdAt: new Date().toISOString() } as any}
          index={0}
          isSelected={false}
          onSelect={() => {}}
          onFolderClick={() => {}}
        />
      </MemoryRouter>,
    );

    const pv = screen.getByTestId('photoview');
    expect(pv.getAttribute('data-src')).toContain('http://127.0.0.1:38977/api/file/1');
    expect(pv.getAttribute('data-src')).toContain('token=local-token');

    fireEvent.click(pv);
    expect(openSpy).not.toHaveBeenCalled();
  });
});
