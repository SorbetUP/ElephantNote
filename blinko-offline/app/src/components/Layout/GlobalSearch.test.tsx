import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

vi.mock('@/lib/i18n', () => ({ default: { t: (k: string) => k } }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: {},
}));

// Make debounced search execute immediately in tests.
vi.mock('@/lib/lodash', () => ({
  _: {
    debounce: (fn: any) => {
      const f: any = (...args: any[]) => fn(...args);
      f.cancel = () => {};
      return f;
    },
  },
}));

vi.mock('@/lib/notePrivacy', () => ({
  isCredentialsNote: () => false,
  maskCredentialsContent: (s: string) => s,
}));

vi.mock('@/components/Common/Iconify/icons', () => ({
  Icon: (props: any) => <span data-testid={`icon:${props.icon}`} />,
}));

vi.mock('../Common/LoadingAndEmpty', () => ({
  LoadingAndEmpty: ({ isLoading, isEmpty }: any) => (
    <div data-testid="loading-empty" data-loading={String(!!isLoading)} data-empty={String(!!isEmpty)} />
  ),
}));

vi.mock('../Common/ScrollArea', () => ({
  ScrollArea: ({ children }: any) => <div data-testid="scroll-area">{children}</div>,
}));

vi.mock('@/components/BlinkoResource/ResourceItem', () => ({
  ResourceItemPreview: ({ item }: any) => <div data-testid={`resource:${item.id}`}>{item.name}</div>,
}));

vi.mock('../BlinkoCard', () => ({
  BlinkoCard: ({ blinkoItem }: any) => <div data-testid={`card:${blinkoItem.id}`}>{blinkoItem.content}</div>,
}));

vi.mock('../BlinkoCard/cardFooter', () => ({
  ConvertTypeButton: () => <button type="button" data-testid="convert-type" />,
}));

vi.mock('@/lib/blinkoEndpoint', () => ({
  getBlinkoEndpoint: (p: string) => `ENDPOINT:${p}`,
}));

const downloadFromLinkStub = vi.fn();
vi.mock('@/lib/tauriHelper', () => ({
  downloadFromLink: (...args: any[]) => downloadFromLinkStub(...args),
}));

vi.mock('@/pages/settings', () => ({
  allSettings: [
    { key: 'basic', title: 'basic', icon: 'tabler:settings', keywords: ['basic'] },
    { key: 'ai', title: 'ai', icon: 'hugeicons:ai-beautify', keywords: ['ai', 'model'] },
    { key: 'all', title: 'all', icon: 'tabler:settings', keywords: [] }, // should be filtered out
  ],
}));

const apiStubs = vi.hoisted(() => ({
  notesList: vi.fn(),
  notesListByIds: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  api: {
    notes: {
      list: { mutate: (...args: any[]) => apiStubs.notesList(...args) },
      listByIds: { mutate: (...args: any[]) => apiStubs.notesListByIds(...args) },
    },
  },
}));

const storeStubs = vi.hoisted(() => ({
  ai: { newChatWithSuggestion: vi.fn() },
  blinko: {
    searchText: '',
    globalSearchTerm: '',
    noteListFilterConfig: { isUseAiQuery: false },
    noteList: { resetAndCall: vi.fn() },
    resourceList: { resetAndCall: vi.fn() },
    updateTicker: 0,
    forceQuery: 0,
  },
}));

vi.mock('@/store', async () => {
  const actual = await vi.importActual<any>('mobx-react-lite');
  const mobx = await vi.importActual<any>('mobx');
  // Mirror app/src/store/index.ts behavior for tests that mock the store module.
  mobx.configure?.({ enforceActions: 'never' });
  return {
    RootStore: {
      Get: (cls: any) => {
        switch (cls?.name) {
          case 'BlinkoStore':
            return storeStubs.blinko;
          case 'AiStore':
            return storeStubs.ai;
          default:
            return {};
        }
      },
      Local: (fn: any) => actual.useLocalObservable(fn),
    },
    rootStore: {},
    useStore: () => ({}),
  };
});

vi.mock('@heroui/react', () => {
  const React = require('react');
  return {
    // Minimal exports needed by other components pulled in by the import graph.
    tv: () => () => ({
      base: () => '',
      content: () => '',
    }),
    useCheckbox: (props: any) => ({
      children: props?.children,
      isSelected: !!props?.isSelected,
      isFocusVisible: false,
      getBaseProps: () => ({}),
      getLabelProps: () => ({ ref: null }),
      getInputProps: () => ({}),
    }),
    Chip: ({ children }: any) => <span data-testid="chip">{children}</span>,
    VisuallyHidden: ({ children }: any) => <>{children}</>,

    Modal: ({ isOpen, children }: any) => (isOpen ? <div data-testid="modal">{children}</div> : null),
    ModalContent: ({ children }: any) => <div data-testid="modal-content">{children}</div>,
    ModalBody: ({ children }: any) => <div data-testid="modal-body">{children}</div>,
    Divider: () => <hr />,
    Button: ({ children, onPress, isIconOnly }: any) => (
      <button type="button" data-testid={isIconOnly ? 'button:icon' : 'button'} onClick={onPress}>
        {children}
      </button>
    ),
    Input: React.forwardRef(({ value, onChange, onKeyDown, 'aria-label': ariaLabel }: any, ref: any) => (
      <input
        ref={ref}
        aria-label={ariaLabel}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
      />
    )),
  };
});

import { GlobalSearch } from './GlobalSearch';

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search}</div>;
}

describe('GlobalSearch (keyboard + results)', () => {
  beforeEach(() => {
    downloadFromLinkStub.mockClear();
    storeStubs.ai.newChatWithSuggestion.mockClear();
    storeStubs.blinko.resourceList.resetAndCall.mockReset();
    apiStubs.notesList.mockReset();
    apiStubs.notesListByIds.mockReset();
  });

  it('searches notes/resources/settings, filters .folder resources, merges notes by resource noteId, and highlights matches', async () => {
    apiStubs.notesList.mockResolvedValue([
      { id: 1, content: 'AI hello world', type: 0 },
    ]);
    storeStubs.blinko.resourceList.resetAndCall.mockResolvedValue([
      { id: 10, name: '.folder', path: '/.folder', noteId: null },
      { id: 11, name: 'report.pdf', path: '/files/report.pdf', noteId: 99 },
    ]);
    apiStubs.notesListByIds.mockResolvedValue([{ id: 99, content: 'Linked note', type: 1 }]);

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={<GlobalSearch isOpen={true} onOpenChange={() => {}} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    const input = screen.getByLabelText('global-search');
    // Query matches settings (ai), note highlight, and resource search.
    fireEvent.change(input, { target: { value: 'ai' } });
    await act(async () => {});

    // Notes include the original + noteId-linked note.
    expect(document.querySelector('[data-search-key="note:1"]')).toBeTruthy();
    expect(document.querySelector('[data-search-key="note:99"]')).toBeTruthy();

    // .folder is filtered.
    expect(screen.queryByTestId('resource:10')).toBeNull();
    expect(screen.getByTestId('resource:11')).toBeTruthy();

    // Settings matched by title/keywords; `all` filtered out.
    expect(document.querySelector('[data-search-key="setting:ai"]')).toBeTruthy();
    expect(document.querySelector('[data-search-key="setting:all"]')).toBeNull();

    // Highlight wrapper renders <mark> for matches.
    expect(document.querySelector('mark')).toBeTruthy();
  });

  it('ArrowDown selects the next result and Enter navigates to the selected note detail', async () => {
    apiStubs.notesList.mockResolvedValue([
      { id: 1, content: 'hello world', type: 0 },
      { id: 2, content: 'another', type: 0 },
    ]);
    storeStubs.blinko.resourceList.resetAndCall.mockResolvedValue([]);
    apiStubs.notesListByIds.mockResolvedValue([]);

    const onOpenChange = vi.fn();
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<><GlobalSearch isOpen={true} onOpenChange={onOpenChange} /><LocationProbe /></>} />
          <Route path="/detail" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    const input = screen.getByLabelText('global-search');
    fireEvent.change(input, { target: { value: 'hello' } });
    await act(async () => {});

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    await act(async () => {});

    expect(screen.getByTestId('location').textContent).toContain('/detail?id=');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('Enter on an @ query triggers AI suggestion and routes to /ai', async () => {
    apiStubs.notesList.mockResolvedValue([]);
    storeStubs.blinko.resourceList.resetAndCall.mockResolvedValue([]);
    apiStubs.notesListByIds.mockResolvedValue([]);

    const onOpenChange = vi.fn();
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<><GlobalSearch isOpen={true} onOpenChange={onOpenChange} /><LocationProbe /></>} />
          <Route path="/ai" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    const input = screen.getByLabelText('global-search');
    fireEvent.change(input, { target: { value: '@what is blinko' } });
    await act(async () => {});

    fireEvent.keyDown(input, { key: 'Enter' });
    await act(async () => {});

    expect(storeStubs.ai.newChatWithSuggestion).toHaveBeenCalledWith('what is blinko');
    expect(screen.getByTestId('location').textContent).toBe('/ai');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('resource search strips #/@ prefixes before calling resourceList.resetAndCall', async () => {
    apiStubs.notesList.mockResolvedValue([]);
    storeStubs.blinko.resourceList.resetAndCall.mockResolvedValue([]);
    apiStubs.notesListByIds.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<GlobalSearch isOpen={true} onOpenChange={() => {}} />} />
        </Routes>
      </MemoryRouter>,
    );

    const input = screen.getByLabelText('global-search');
    fireEvent.change(input, { target: { value: '#report' } });
    await act(async () => {});

    expect(storeStubs.blinko.resourceList.resetAndCall).toHaveBeenCalled();
    const lastCall = storeStubs.blinko.resourceList.resetAndCall.mock.calls.at(-1)?.[0];
    expect(lastCall.searchText).toBe('report');
  });

  it('Escape closes the modal', async () => {
    apiStubs.notesList.mockResolvedValue([]);
    storeStubs.blinko.resourceList.resetAndCall.mockResolvedValue([]);
    apiStubs.notesListByIds.mockResolvedValue([]);

    const onOpenChange = vi.fn();
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<GlobalSearch isOpen={true} onOpenChange={onOpenChange} />} />
        </Routes>
      </MemoryRouter>,
    );

    const input = screen.getByLabelText('global-search');
    fireEvent.keyDown(input, { key: 'Escape' });
    await act(async () => {});
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
