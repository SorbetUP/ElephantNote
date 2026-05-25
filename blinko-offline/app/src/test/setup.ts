import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// React 18 testing environment hint.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// In Vitest (Node) with JSDOM, leaked timers/intervals are a common cause of
// "tests finish but process never exits". If the returned handle supports
// `unref()` (Node timers), unref it so it won't keep the event loop alive.
function unrefTimers() {
  const g = globalThis as any;
  const wrap = (name: 'setTimeout' | 'setInterval') => {
    const orig = g[name];
    if (typeof orig !== 'function' || orig.__blinko_wrapped) return;
    const wrapped = (...args: any[]) => {
      const h = orig(...args);
      try {
        h?.unref?.();
      } catch {
        // ignore
      }
      return h;
    };
    wrapped.__blinko_wrapped = true;
    g[name] = wrapped;
  };
  wrap('setTimeout');
  wrap('setInterval');
}

unrefTimers();

afterEach(() => {
  cleanup();
  // Prevent fake timers from leaking across tests (a common cause of timeouts/flakiness).
  vi.useRealTimers();
  vi.restoreAllMocks();
  // Some test files may swap timer impls; re-apply our unref wrappers.
  unrefTimers();
});

if (typeof window !== 'undefined') {
  // Minimal matchMedia stub for hooks like useMediaQuery().
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => {
      return {
        matches: query.includes('min-width: 768px'),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false
      };
    }
  });

  // Use timers to implement rAF so tests can flush it with fake timers when needed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
    return window.setTimeout(() => cb(Date.now()), 0);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).cancelAnimationFrame = (id: number) => {
    window.clearTimeout(id);
  };
}
