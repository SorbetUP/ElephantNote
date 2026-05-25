import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { ExcalidrawEditorDialog } from './ExcalidrawEditorDialog';

vi.mock('@/lib/i18n', () => ({ default: { t: (k: string) => k } }));

const themeStub = vi.hoisted(() => ({ theme: 'light' as any, resolvedTheme: 'light' as any }));

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: themeStub.theme, resolvedTheme: themeStub.resolvedTheme, setTheme: () => {} }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: {},
}));

vi.mock('@/components/Common/Iconify/icons', () => ({
  Icon: () => <span data-testid="loading" />,
}));

vi.mock('@heroui/react', () => ({
  Button: ({ children, onPress }: any) => (
    <button type="button" onClick={onPress}>
      {children}
    </button>
  ),
}));

vi.mock('@/store', () => ({
  RootStore: {
    Get: () => ({ error: () => {}, success: () => {}, loading: () => {}, dismiss: () => {} }),
  },
}));

vi.mock('@/store/module/DialogStandalone', () => ({
  DialogStandaloneStore: { close: () => {}, show: () => {} },
}));

vi.mock('@/store/module/Toast/Toast', () => ({
  ToastPlugin: class ToastPlugin {},
}));

const excalidrawStubs = vi.hoisted(() => ({
  loadFromBlob: vi.fn(),
  getDataURL: vi.fn(async () => 'data:image/png;base64,AA=='),
}));

vi.mock('@excalidraw/excalidraw/index.css', () => ({}));

vi.mock('@excalidraw/excalidraw', () => ({
  loadFromBlob: (...args: any[]) => excalidrawStubs.loadFromBlob(...args),
  getDataURL: (...args: any[]) => excalidrawStubs.getDataURL(...args),
  exportToBlob: vi.fn(async () => new Blob()),
  MIME_TYPES: { png: 'image/png' },
  Excalidraw: (props: any) => (
    <div
      data-testid="excalidraw"
      data-elements={String(props?.initialData?.elements?.length ?? 0)}
      data-theme={String(props?.theme ?? '')}
    />
  ),
}));

describe('ExcalidrawEditorDialog', () => {
  beforeEach(() => {
    themeStub.theme = 'light';
    themeStub.resolvedTheme = 'light';

    excalidrawStubs.loadFromBlob.mockReset();
    excalidrawStubs.getDataURL.mockClear();

    // jsdom stubs
    // @ts-ignore
    global.URL.createObjectURL = vi.fn(() => 'blob:mock');
    // @ts-ignore
    global.URL.revokeObjectURL = vi.fn();

    // Minimal Image implementation that "loads" immediately.
    // @ts-ignore
    global.Image = class MockImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      naturalWidth = 800;
      naturalHeight = 600;
      width = 800;
      height = 600;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    };
  });

  it('falls back to inserting the image when loadFromBlob returns an empty scene', async () => {
    excalidrawStubs.loadFromBlob.mockResolvedValue({ elements: [], files: {} });

    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    render(
      <ExcalidrawEditorDialog
        title="Excalidraw"
        initialBlob={blob}
        initialFileName="pic.png"
        onSave={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('excalidraw')).toBeTruthy();
    });

    expect(excalidrawStubs.loadFromBlob).toHaveBeenCalled();
    expect(screen.getByTestId('excalidraw').getAttribute('data-elements')).toBe('1');
  });

  it('passes the resolved Blinko theme to Excalidraw', async () => {
    themeStub.theme = 'dark';
    themeStub.resolvedTheme = 'dark';

    excalidrawStubs.loadFromBlob.mockResolvedValue({ elements: [], files: {} });

    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    render(
      <ExcalidrawEditorDialog
        title="Excalidraw"
        initialBlob={blob}
        initialFileName="pic.png"
        onSave={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('excalidraw')).toBeTruthy();
    });

    expect(screen.getByTestId('excalidraw').getAttribute('data-theme')).toBe('dark');
  });
});
