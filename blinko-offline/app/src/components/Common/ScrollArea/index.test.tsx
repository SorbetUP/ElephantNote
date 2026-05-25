import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/lib/i18n', () => ({
  default: { t: (k: string) => k }
}));

import { ScrollArea } from './index';

const setScrollMetrics = (
  el: HTMLDivElement,
  metrics: { scrollHeight: number; clientHeight: number; scrollTop: number }
) => {
  Object.defineProperty(el, 'scrollHeight', { value: metrics.scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: metrics.clientHeight, configurable: true });
  el.scrollTop = metrics.scrollTop;
};

describe('ScrollArea onBottom', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onBottom when near bottom (prefetch window)', async () => {
    vi.useFakeTimers();

    const onBottom = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <ScrollArea onBottom={onBottom} className="h-[500px]">
        <div>content</div>
      </ScrollArea>
    );

    const el = container.querySelector('div[data-scroll-area-id]') as HTMLDivElement;
    expect(el).toBeTruthy();

    // Old behavior (clientHeight + 100) would NOT trigger here:
    // remaining = 800, threshold = 600.
    setScrollMetrics(el, { scrollHeight: 2000, clientHeight: 500, scrollTop: 1200 });

    el.dispatchEvent(new Event('scroll'));
    await vi.runAllTimersAsync();

    expect(onBottom).toHaveBeenCalledTimes(1);
  });

  it('auto-fills: after an async onBottom resolves, triggers again if still near bottom and content grew', async () => {
    vi.useFakeTimers();

    let el!: HTMLDivElement;
    let calls = 0;
    const onBottom = vi.fn(async () => {
      calls++;
      // Simulate page append increasing scrollHeight.
      if (calls === 1) {
        Object.defineProperty(el, 'scrollHeight', { value: 2600, configurable: true });
      }
    });

    const { container } = render(
      <ScrollArea onBottom={onBottom} className="h-[500px]">
        <div>content</div>
      </ScrollArea>,
    );

    el = container.querySelector('div[data-scroll-area-id]') as HTMLDivElement;
    expect(el).toBeTruthy();
    setScrollMetrics(el, { scrollHeight: 2000, clientHeight: 500, scrollTop: 1400 });

    el.dispatchEvent(new Event('scroll'));
    await vi.runAllTimersAsync();
    await Promise.resolve();
    await vi.runAllTimersAsync();

    expect(onBottom).toHaveBeenCalledTimes(2);
  });

  it('does not re-enter onBottom while a previous call is in-flight', async () => {
    vi.useFakeTimers();

    let resolve!: () => void;
    const inFlight = new Promise<void>((r) => {
      resolve = r;
    });
    const onBottom = vi.fn(() => inFlight);

    const { container } = render(
      <ScrollArea onBottom={onBottom} className="h-[500px]">
        <div>content</div>
      </ScrollArea>
    );
    const el = container.querySelector('div[data-scroll-area-id]') as HTMLDivElement;
    setScrollMetrics(el, { scrollHeight: 2000, clientHeight: 500, scrollTop: 1400 });

    el.dispatchEvent(new Event('scroll'));
    el.dispatchEvent(new Event('scroll'));
    await vi.runAllTimersAsync();

    expect(onBottom).toHaveBeenCalledTimes(1);

    resolve();
    await Promise.resolve();
    await vi.runAllTimersAsync();

    el.dispatchEvent(new Event('scroll'));
    await vi.runAllTimersAsync();
    expect(onBottom).toHaveBeenCalledTimes(2);
  });

  it('resets horizontal offset on wheel interactions', () => {
    const { container } = render(
      <ScrollArea className="h-[500px]">
        <div>content</div>
      </ScrollArea>
    );

    const el = container.querySelector('div[data-scroll-area-id]') as HTMLDivElement;
    expect(el).toBeTruthy();

    el.scrollLeft = 96;
    el.dispatchEvent(new Event('wheel'));
    expect(el.scrollLeft).toBe(0);
  });

  it('does not reject when touch events originate from a text node', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { getByText } = render(
      <ScrollArea onRefresh={onRefresh} className="h-[500px]">
        <div>content</div>
      </ScrollArea>,
    );

    const textNode = getByText('content').firstChild as Text;
    expect(textNode?.nodeType).toBe(Node.TEXT_NODE);

    const rejections: unknown[] = [];
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      rejections.push(event.reason);
      event.preventDefault();
    };
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    textNode.dispatchEvent(new Event('touchstart', { bubbles: true, cancelable: true }));
    textNode.dispatchEvent(new Event('touchmove', { bubbles: true, cancelable: true }));
    textNode.dispatchEvent(new Event('touchend', { bubbles: true, cancelable: true }));

    await Promise.resolve();
    window.removeEventListener('unhandledrejection', onUnhandledRejection);

    expect(rejections).toHaveLength(0);
  });
});
