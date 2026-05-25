import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { BaseStore } from '@/store/baseStore';
import { Sidebar } from './Sidebar';

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
    Button: ({ children, onPress, className, isIconOnly }: any) => (
      <button
        type="button"
        data-testid={isIconOnly ? 'button:icon' : 'button'}
        className={className}
        onClick={onPress}
      >
        {children}
      </button>
    ),
    ScrollShadow: ({ children, className }: any) => (
      <div data-testid="scroll-shadow" className={className}>
        {children}
      </div>
    ),
  };
});

vi.mock('../Common/UserAvatarDropdown', () => ({
  UserAvatarDropdown: ({ collapsed }: any) => (
    <div data-testid="user-avatar-dropdown" data-collapsed={String(!!collapsed)} />
  ),
}));

vi.mock('../Common/TagListPanel', () => ({
  TagListPanel: () => <div data-testid="tag-list-panel" />,
}));

const stubs = vi.hoisted(() => ({
  base: null as null | BaseStore,
  blinko: null as any,
}));

vi.mock('@/store', () => ({
  RootStore: {
    Get: (cls: any) => {
      switch (cls?.name) {
        case 'BaseStore':
          return stubs.base;
        case 'BlinkoStore':
          return stubs.blinko;
        default:
          return {};
      }
    },
  },
}));

vi.mock('usehooks-ts', () => ({
  useMediaQuery: () => true,
}));

describe('Sidebar (desktop behaviors)', () => {
  beforeEach(() => {
    localStorage.clear();
    stubs.base = new BaseStore();
    stubs.blinko = {
      tagList: { value: { listTags: [] as any[] } },
    };
  });

  it('renders the full desktop sidebar navigation list (including desktop-only routes)', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar />
      </MemoryRouter>,
    );

    // BaseStore routerList items (non-hiddenSidebar) should be visible as labels when expanded.
    expect(screen.getByText('analytics')).toBeTruthy();
    expect(screen.getByText('resources')).toBeTruthy();
    expect(screen.getByText('archived')).toBeTruthy();
    expect(screen.getByText('trash')).toBeTruthy();
    expect(screen.queryByText('plugin')).toBeNull();
    expect(screen.queryByText('settings')).toBeNull();
  });

  it('shows a resize handle on desktop and persists width to localStorage on drag', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar />
      </MemoryRouter>,
    );

    const handle = document.querySelector('div.cursor-col-resize');
    expect(handle).toBeTruthy();

    fireEvent.mouseDown(handle!);
    fireEvent.mouseMove(document, { clientX: 350 });
    fireEvent.mouseUp(document);

    expect(JSON.parse(localStorage.getItem('sidebar-width')!)).toBe(350);
  });

  it('has a hover-based collapse/expand toggle button and persists collapsed state', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar />
      </MemoryRouter>,
    );

    // When expanded, route labels are visible.
    expect(screen.getByText('blinko')).toBeTruthy();

    const toggleBtn = screen.getAllByTestId('button:icon')[0];
    expect(toggleBtn.className).toContain('opacity-0');
    expect(toggleBtn.className).toContain('group-hover/sidebar:opacity-100');

    fireEvent.click(toggleBtn);

    // Collapsing stores state and hides the resize handle.
    expect(JSON.parse(localStorage.getItem('sidebar-collapsed')!)).toBe(true);
    expect(document.querySelector('div.cursor-col-resize')).toBeNull();

    // When collapsed, labels are hidden.
    expect(screen.queryByText('blinko')).toBeNull();

    // When collapsed, sidebar links expose a title tooltip for hover affordance.
    const anyLink = document.querySelector('a[title]') as HTMLAnchorElement | null;
    expect(anyLink).toBeTruthy();
    expect(anyLink!.getAttribute('title')).toBeTruthy();
  });

	  it('shows TagListPanel only when not collapsed and tags exist', () => {
	    stubs.blinko.tagList.value.listTags = [{ id: 1 }];
	    const { rerender } = render(
	      <MemoryRouter initialEntries={['/']}>
        <Sidebar />
      </MemoryRouter>,
    );
	
	    expect(screen.getByTestId('tag-list-panel')).toBeTruthy();
	
	    act(() => {
	      stubs.base!.toggleSidebar();
	    });
	    rerender(
	      <MemoryRouter initialEntries={['/']}>
	        <Sidebar />
	      </MemoryRouter>,
    );

    expect(screen.queryByTestId('tag-list-panel')).toBeNull();
  });

  it('shows a visual indicator while resizing', () => {
    stubs.base!.isResizing = true;
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar />
      </MemoryRouter>,
    );

    const handle = document.querySelector('div.cursor-col-resize');
    expect(handle).toBeTruthy();
    expect(handle!.className).toContain('bg-primary/40');
  });
});
