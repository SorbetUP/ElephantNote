import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/lib/i18n', () => ({ default: { t: (k: string) => k } }));

const stubs = vi.hoisted(() => ({
  isIOS: true,
}));

vi.mock('@/lib/hooks', async () => {
  const actual: any = await vi.importActual('@/lib/hooks');
  return {
    ...actual,
    useIsIOS: () => stubs.isIOS,
  };
});

vi.mock('motion/react', () => ({
  motion: {
    // eslint-disable-next-line react/display-name
    div: (props: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { layout, animate, transition, ...rest } = props;
      return <div {...rest} />;
    },
  },
}));

import { ExpandableContainer } from './expandContainer';

describe('ExpandableContainer (iOS expand behavior)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    stubs.isIOS = true;

    const header = document.createElement('div');
    header.className = 'blinko-mobile-header';
    document.body.appendChild(header);

    const bottom = document.createElement('div');
    bottom.className = 'blinko-bottom-bar';
    document.body.appendChild(bottom);
  });

  it('hides mobile header + bottom bar while expanded and restores afterwards', () => {
    const header = document.querySelector('.blinko-mobile-header') as HTMLElement;
    const bottom = document.querySelector('.blinko-bottom-bar') as HTMLElement;

    const { rerender, unmount } = render(
      <ExpandableContainer isExpanded={true}>
        <div>child</div>
      </ExpandableContainer>,
    );

    expect(header.style.display).toBe('none');
    expect(bottom.style.display).toBe('none');

    rerender(
      <ExpandableContainer isExpanded={false}>
        <div>child</div>
      </ExpandableContainer>,
    );

    expect(header.style.display).toBe('');
    expect(bottom.style.display).toBe('');

    unmount();
    expect(header.style.display).toBe('');
    expect(bottom.style.display).toBe('');
  });

  it('renders expanded content as a fixed overlay on iOS via a portal', () => {
    render(
      <ExpandableContainer isExpanded={true}>
        <div data-testid="inside">child</div>
      </ExpandableContainer>,
    );

    const fixed = document.body.querySelector('div.fixed.inset-0') as HTMLDivElement | null;
    expect(fixed).toBeTruthy();
    expect(document.body.querySelector('[data-testid="inside"]')).toBeTruthy();
  });
});
