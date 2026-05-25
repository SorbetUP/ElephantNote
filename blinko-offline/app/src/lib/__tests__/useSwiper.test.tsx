import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';

import { useSwiper } from '../hooks';

function dispatchTouch(type: 'touchstart' | 'touchmove', clientY: number) {
  const ev = new Event(type);
  Object.defineProperty(ev, 'touches', {
    value: [{ clientY }],
    configurable: true,
  });
  window.dispatchEvent(ev as any);
}

function HookProbe({ threshold }: { threshold: number }) {
  const visible = useSwiper(threshold);
  return <div data-testid="visible">{String(visible)}</div>;
}

describe('useSwiper', () => {
  it('hides on swipe up and shows on swipe down once delta exceeds threshold', async () => {
    render(<HookProbe threshold={10} />);

    expect(screen.getByTestId('visible').textContent).toBe('true');

    // Swipe up: 100 -> 80 (delta -20)
    await act(async () => {
      dispatchTouch('touchstart', 100);
      dispatchTouch('touchmove', 80);
    });
    expect(screen.getByTestId('visible').textContent).toBe('false');

    // Swipe down: 80 -> 130 (delta +50)
    await act(async () => {
      dispatchTouch('touchstart', 80);
      dispatchTouch('touchmove', 130);
    });
    expect(screen.getByTestId('visible').textContent).toBe('true');
  });

  it('does nothing if movement is below threshold', () => {
    render(<HookProbe threshold={50} />);

    expect(screen.getByTestId('visible').textContent).toBe('true');

    dispatchTouch('touchstart', 100);
    dispatchTouch('touchmove', 80); // delta -20 < 50

    expect(screen.getByTestId('visible').textContent).toBe('true');
  });
});
