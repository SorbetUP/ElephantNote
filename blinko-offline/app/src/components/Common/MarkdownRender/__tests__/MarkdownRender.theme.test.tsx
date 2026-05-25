import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const themeState: { theme?: string; resolvedTheme?: string } = {
  theme: "system",
  resolvedTheme: undefined,
};

let importNonce = 0;
async function importFreshMarkdownRender() {
  importNonce += 1;
  // Avoid cross-file module cache pollution in threaded runs.
  return import(
    /* @vite-ignore */
    `../index?test=${importNonce}`
  );
}

vi.mock("mobx-react-lite", () => ({
  observer: (c: any) => c,
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: themeState.theme, resolvedTheme: themeState.resolvedTheme }),
}));

vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: "/" }),
  useNavigate: () => vi.fn(),
}));

vi.mock("@/store", () => ({
  RootStore: {
    Get: () => ({ forceQuery: 0 }),
  },
}));

vi.mock("@/store/blinkoStore", () => ({
  BlinkoStore: class BlinkoStore {},
}));

vi.mock("../LinkPreview", () => ({
  LinkPreview: () => null,
}));

vi.mock("../Code", () => ({
  Code: ({ children }: any) => <code>{children}</code>,
}));

vi.mock("../MermaidWrapper", () => ({
  MermaidWrapper: () => null,
}));

vi.mock("../MarkmapWrapper", () => ({
  MarkmapWrapper: () => null,
}));

vi.mock("../EchartsWrapper", () => ({
  EchartsWrapper: () => null,
}));

vi.mock("@/lib/media/protectedApiImages", () => ({
  isProtectedApiUrl: () => false,
}));

vi.mock("@/components/Common/ImagePreviewDialog", () => ({
  showImagePreviewDialog: vi.fn(),
}));

describe("MarkdownRender theme resolution", () => {
  beforeEach(() => {
    vi.resetModules();
    document.documentElement.classList.remove("dark", "light");
    document.body.classList.remove("dark", "light");
    themeState.theme = "system";
    themeState.resolvedTheme = undefined;
  });

  afterEach(() => {
    document.documentElement.classList.remove("dark", "light");
    document.body.classList.remove("dark", "light");
  });

  it("uses resolvedTheme when available", async () => {
    themeState.resolvedTheme = "dark";
    const { MarkdownRender } = await importFreshMarkdownRender();
    const { container } = render(<MarkdownRender content={"hello"} />);
    const root = container.querySelector(".markdown-body.content") as HTMLElement | null;
    expect(root?.getAttribute("data-markdown-theme")).toBe("dark");
  });

  it("falls back to body dark class when theme is system", async () => {
    document.body.classList.add("dark");
    const { MarkdownRender } = await importFreshMarkdownRender();
    const { container } = render(<MarkdownRender content={"hello"} />);
    const root = container.querySelector(".markdown-body.content") as HTMLElement | null;
    expect(root?.getAttribute("data-markdown-theme")).toBe("dark");
  });

  it("falls back to light when no theme signal exists", async () => {
    const { MarkdownRender } = await importFreshMarkdownRender();
    const { container } = render(<MarkdownRender content={"hello"} />);
    const root = container.querySelector(".markdown-body.content") as HTMLElement | null;
    expect(root?.getAttribute("data-markdown-theme")).toBe("light");
  });
});
