import React from "react";
import { act, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { eventBusMock, getListenerCount } = vi.hoisted(() => {
  const listeners = new Map<string, Set<(...args: any[]) => void>>();

  const on = (event: string, handler: (...args: any[]) => void) => {
    const set = listeners.get(event) ?? new Set();
    set.add(handler);
    listeners.set(event, set);
  };

  const off = (event: string, handler: (...args: any[]) => void) => {
    const set = listeners.get(event);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) listeners.delete(event);
  };

  const emit = (event: string, ...args: any[]) => {
    const set = listeners.get(event);
    if (!set) return;
    for (const handler of Array.from(set)) handler(...args);
  };

  return {
    eventBusMock: { on, off, emit },
    getListenerCount: (event: string) => listeners.get(event)?.size ?? 0,
  };
});

vi.mock("@/lib/event", () => ({
  eventBus: eventBusMock,
}));

const { axiosGetMock, getBlinkoEndpointMock, setLocalApiReady } = vi.hoisted(() => {
  let localApiReady = false;

  const setLocalApiReady = (v: boolean) => {
    localApiReady = v;
  };

  const axiosGetMock = vi.fn(async () => {
    return { data: new Blob(["x"], { type: "image/png" }) };
  });

  const getBlinkoEndpointMock = vi.fn((path: string = "") => {
    // Simulate Tauri local-mode behavior: before local API is ready, endpoint is unknown and
    // getBlinkoEndpoint returns the raw path (e.g. "/api/..."). After ready, it prefixes with
    // the resolved http://127.0.0.1:<port> base.
    if (typeof path !== "string") return "";
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    if (!localApiReady) return path;
    const p = path.startsWith("/") ? path : `/${path}`;
    return `http://127.0.0.1:61164${p}`;
  });

  return { axiosGetMock, getBlinkoEndpointMock, setLocalApiReady };
});

vi.mock("@/lib/axios", () => ({
  default: {
    get: axiosGetMock,
  },
}));

vi.mock("@/lib/blinkoEndpoint", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getBlinkoEndpoint: getBlinkoEndpointMock,
  };
});

vi.mock("@/components/Common/ImagePreviewDialog", () => ({
  showImagePreviewDialog: vi.fn(),
}));

describe("ImageWrapper (local-api:ready retry)", () => {
  it("retries protected /api images when local-api becomes available", async () => {
    // Simulate Tauri runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prevTauri = (window as any).__TAURI__;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI__ = {};

    // JSDOM: stub object URL.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).URL.createObjectURL = vi.fn(() => "blob:mock");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).URL.revokeObjectURL = vi.fn();

    try {
      const { ImageWrapper } = await import("../ImageWrapper");

      const { container } = render(<ImageWrapper src="/api/file/a.png" alt="a" />);
      // Ensure effects are installed before emitting events (avoids flakes under load).
      await act(async () => {});
      expect(getListenerCount("local-api:ready")).toBeGreaterThan(0);
      const img = container.querySelector("img") as HTMLImageElement | null;
      // Not ready yet: avoid rendering a broken <img src="/api/..."> in the WebView origin.
      expect(img).toBeNull();
      expect(axiosGetMock).not.toHaveBeenCalled();

      // Local API becomes ready later.
      act(() => {
        setLocalApiReady(true);
        eventBusMock.emit("local-api:ready", "http://127.0.0.1:61164");
      });

      await waitFor(() => {
        expect(axiosGetMock).toHaveBeenCalledTimes(1);
      });

      const imgAfter = container.querySelector("img") as HTMLImageElement | null;
      expect(imgAfter).toBeTruthy();
      expect(axiosGetMock).toHaveBeenCalledWith("http://127.0.0.1:61164/api/file/a.png", { responseType: "blob" });
      expect(imgAfter?.getAttribute("src")).toBe("blob:mock");
    } finally {
      // Restore.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (prevTauri === undefined) delete (window as any).__TAURI__;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      else (window as any).__TAURI__ = prevTauri;
    }
  });
});
