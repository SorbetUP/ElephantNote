import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import dayjs from '@/lib/dayjs';

vi.mock('@/lib/i18n', () => ({ default: { t: (k: string) => k } }));

const stubs = vi.hoisted(() => {
  return {
    // Captured Masonry props for assertions.
    lastMasonryProps: null as any,
    // Media query: mobile.
    isPc: false,
    blinko: {
      config: { value: {} as any },
      noteListFilterConfig: { isArchived: false, isRecycle: false },
      use: vi.fn(),
      useQuery: vi.fn(),
      onBottom: vi.fn(),
      blinkoList: { value: [{ id: 1 }], isEmpty: false, isLoading: false, isLoadAll: false },
      noteOnlyList: { value: [], isEmpty: true, isLoading: false, isLoadAll: false },
      todoList: { value: [], isEmpty: true, isLoading: false, isLoadAll: false },
      archivedList: { value: [], isEmpty: true, isLoading: false, isLoadAll: false },
      trashList: { value: [], isEmpty: true, isLoading: false, isLoadAll: false },
      noteList: { value: [], isEmpty: true, isLoading: false, isLoadAll: false },
    },
  };
});

vi.mock('usehooks-ts', () => ({
  useMediaQuery: () => stubs.isPc,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: {},
}));

vi.mock('@/store', () => ({
  RootStore: {
    Get: (cls: any) => {
      if (cls?.name === 'BlinkoStore') return stubs.blinko;
      return {};
    },
    Local: (fn: any) => fn(),
  },
}));

vi.mock('@/components/BlinkoEditor', () => ({
  BlinkoEditor: () => <div data-testid="editor" />,
}));

vi.mock('@/components/BlinkoAddButton', () => ({
  BlinkoAddButton: () => <div data-testid="add-button" />,
}));

vi.mock('@/components/Common/LoadingAndEmpty', () => ({
  LoadingAndEmpty: () => null,
}));

vi.mock('@/components/Common/ScrollArea', () => ({
  ScrollArea: React.forwardRef(({ children }: any, _ref) => <div data-testid="scroll-area">{children}</div>),
}));

vi.mock('@/components/BlinkoCard', () => ({
  BlinkoCard: () => <div data-testid="card" />,
}));

vi.mock('@/components/Common/Iconify/icons', () => ({
  Icon: (props: any) => <span data-testid={`icon:${props.icon}`} />,
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: any) => <>{children}</>,
  DragOverlay: ({ children }: any) => <>{children}</>,
  closestCenter: () => null,
}));

vi.mock('@/hooks/useDragCard', () => ({
  useDragCard: ({ notes }: any) => ({
    localNotes: notes ?? [],
    sensors: [],
    setLocalNotes: () => {},
    handleDragStart: () => {},
    handleDragEnd: () => {},
    handleDragOver: () => {},
  }),
  DraggableBlinkoCard: ({ blinkoItem }: any) => <div data-testid={`draggable:${blinkoItem?.id ?? 'x'}`} />,
}));

vi.mock('react-masonry-css', () => ({
  default: (props: any) => {
    stubs.lastMasonryProps = props;
    return <div data-testid="masonry">{props.children}</div>;
  },
}));

import HomePage from './index';

describe('Home page (mobile UX)', () => {
  beforeEach(() => {
    stubs.isPc = false;
    stubs.lastMasonryProps = null;
    stubs.blinko.config.value = {};
    stubs.blinko.blinkoList.value = [{ id: 1 }];
    stubs.blinko.blinkoList.isEmpty = false;
    stubs.blinko.todoList.value = [];
    stubs.blinko.todoList.isEmpty = true;
  });

  it('renders the note feed when the current list is non-empty', () => {
    stubs.blinko.blinkoList.value = [{ id: 1 }, { id: 2 }];
    stubs.blinko.blinkoList.isEmpty = false;

    const { getByTestId } = render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(getByTestId('masonry')).toBeTruthy();
    expect(getByTestId('draggable:1')).toBeTruthy();
    expect(getByTestId('draggable:2')).toBeTruthy();
  });

  it('shows the floating add button and does not render the inline editor on mobile', () => {
    const { queryByTestId, getByTestId } = render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(getByTestId('add-button')).toBeTruthy();
    expect(queryByTestId('editor')).toBeNull();
  });

  it('uses a single-column masonry breakpoint at <=768px by default', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(stubs.lastMasonryProps).toBeTruthy();
    expect(stubs.lastMasonryProps.breakpointCols[768]).toBe(1);
  });

  it('groups todos by date and uses today/yesterday labels in the todo timeline view', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 9, 12, 0, 0));
    try {
      const today = new Date(2026, 1, 9, 9, 0, 0);
      const yesterday = new Date(2026, 1, 8, 9, 0, 0);
      const older = new Date(2026, 1, 1, 9, 0, 0);

      stubs.blinko.todoList.value = [
        { id: 1, createdAt: today },
        { id: 2, createdAt: yesterday },
        { id: 3, createdAt: older },
      ];
      stubs.blinko.todoList.isEmpty = false;

      const { getByText, getAllByTestId, container } = render(
        <MemoryRouter initialEntries={['/?path=todo']}>
          <Routes>
            <Route path="/" element={<HomePage />} />
          </Routes>
        </MemoryRouter>,
      );

      const olderLabel = dayjs(older).format('MM/DD (ddd)');
      expect(getByText('today')).toBeTruthy();
      expect(getByText('yesterday')).toBeTruthy();
      expect(getByText(olderLabel)).toBeTruthy();
      expect(getAllByTestId('card')).toHaveLength(3);

      // Timeline groups are sorted by date desc.
      const headers = Array.from(container.querySelectorAll('h3')).map(el => el.textContent);
      expect(headers).toEqual(['today', 'yesterday', olderLabel]);
    } finally {
      vi.useRealTimers();
    }
  });
});
