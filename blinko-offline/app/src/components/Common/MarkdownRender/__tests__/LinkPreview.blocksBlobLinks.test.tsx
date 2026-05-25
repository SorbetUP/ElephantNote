import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";

vi.mock("mobx-react-lite", () => ({
  observer: (c: any) => c,
}));

vi.mock("@/lib/tauriHelper", () => ({
  isInTauri: () => true,
  openFromLinkInDefaultApp: vi.fn(),
}));

vi.mock("@/store", () => ({
  RootStore: {
    Local: (fn: any) => fn(),
  },
}));

vi.mock("@/store/standard/StorageState", () => ({
  StorageState: class StorageState<T> {
    value: T | null;
    constructor({ default: def }: any) {
      this.value = def;
    }
    setValue(v: any) {
      this.value = v;
    }
  },
}));

vi.mock("@/lib/trpc", () => ({
  api: {
    public: {
      linkPreview: {
        query: vi.fn(async () => ({ title: "t", description: "d" })),
      },
    },
  },
}));

// UI libs not needed for this test.
vi.mock("@heroui/react", () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  Image: () => null,
  Popover: ({ children }: any) => <div>{children}</div>,
  PopoverTrigger: ({ children }: any) => <div>{children}</div>,
  PopoverContent: ({ children }: any) => <div>{children}</div>,
}));

describe("LinkPreview (blob links)", () => {
  beforeEach(() => {
    window.open = vi.fn();
  });

  it("does not open blob: links (prevents navigation away from the app)", async () => {
    const { LinkPreview } = await import("../LinkPreview");
    const { getByText } = render(
      <LinkPreview href="blob:tauri://localhost/some-id" text="excalidraw.png" isBlock />,
    );

    fireEvent.click(getByText("excalidraw.png"));
    expect(window.open).not.toHaveBeenCalled();
  });
});

