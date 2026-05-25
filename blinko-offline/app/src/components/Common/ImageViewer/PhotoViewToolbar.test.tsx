import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";

import { PhotoViewToolbar } from "./PhotoViewToolbar";

vi.mock("@/components/Common/Iconify/icons", () => ({
  Icon: ({ icon }: any) => <span data-testid={`icon:${icon}`} />,
}));

vi.mock("@/lib/tauriHelper", () => ({
  isAndroid: () => true,
  isInTauri: () => true,
}));

describe("PhotoViewToolbar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // @ts-ignore
    global.requestAnimationFrame = (cb: any) => setTimeout(cb, 0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("closes the viewer before opening Excalidraw edit flow", async () => {
    const onClose = vi.fn();
    const onEdit = vi.fn();

    render(
      <PhotoViewToolbar
        overlayProps={
          {
            images: [],
            index: 0,
            onIndexChange: vi.fn(),
            visible: true,
            onClose,
            overlayVisible: true,
            overlay: null,
            rotate: 0,
            onRotate: vi.fn(),
            scale: 1,
            onScale: vi.fn(),
          } as any
        }
        onEdit={onEdit}
      />,
    );

    fireEvent.click(screen.getByTestId("icon:simple-icons:excalidraw").parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("renders rotate/zoom/reset/close controls", () => {
    render(
      <PhotoViewToolbar
        overlayProps={
          {
            images: [],
            index: 0,
            onIndexChange: vi.fn(),
            visible: true,
            onClose: vi.fn(),
            overlayVisible: true,
            overlay: null,
            rotate: 0,
            onRotate: vi.fn(),
            scale: 1,
            onScale: vi.fn(),
          } as any
        }
      />,
    );

    expect(screen.getByTestId("icon:tabler:rotate-2")).toBeTruthy();
    expect(screen.getByTestId("icon:tabler:rotate-clockwise-2")).toBeTruthy();
    expect(screen.getByTestId("icon:tabler:zoom-in")).toBeTruthy();
    expect(screen.getByTestId("icon:tabler:zoom-out")).toBeTruthy();
    expect(screen.getByTestId("icon:tabler:refresh")).toBeTruthy();
    expect(screen.getByTestId("icon:tabler:x")).toBeTruthy();
  });
});

