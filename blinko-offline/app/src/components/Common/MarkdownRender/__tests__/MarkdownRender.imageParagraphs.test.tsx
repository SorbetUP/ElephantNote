import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("mobx-react-lite", () => ({
  observer: (c: any) => c,
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark" }),
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

// Keep MarkdownRender focused: no network-y previews.
vi.mock("../LinkPreview", () => ({
  LinkPreview: () => null,
}));

// Keep this test fast and focused on <p>/<img> structure.
// MarkdownRender's other renderers pull in heavy deps (mermaid/echarts/markmap/syntax-highlighter).
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

describe("MarkdownRender (image paragraphs)", () => {
  beforeEach(() => {
    // This suite needs a clean module graph so our local mocks apply even when running the full test suite
    // (where other tests may have already imported/mocked these modules).
    vi.resetModules();
  });

  it("renders image-only paragraphs as a non-<p> block to avoid WebKit selection/tap highlight artifacts", async () => {
    // Other suites may mock this module (e.g. NoteContent tests). Import the actual implementation here.
    const { MarkdownRender } = await vi.importActual<typeof import("../index")>("../index");
    const { container } = render(<MarkdownRender content={"![a](https://example.com/a.png)"} />);

    const img = container.querySelector("img") as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img?.closest("p")).toBeNull();
    expect(img?.closest("div")).toBeTruthy();
  }, 15_000);

  it("keeps normal paragraphs as <p> when the image is mixed with text", async () => {
    const { MarkdownRender } = await vi.importActual<typeof import("../index")>("../index");
    const { container } = render(<MarkdownRender content={"hello ![a](https://example.com/a.png) world"} />);

    const img = container.querySelector("img") as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img?.closest("p")).toBeTruthy();
  }, 15_000);
});
