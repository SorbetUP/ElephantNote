import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

const axiosGet = vi.fn();

vi.mock("@/lib/axios", () => ({
  default: {
    get: (...args: any[]) => axiosGet(...args),
  },
}));

vi.mock("@/lib/blinkoEndpoint", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getBlinkoEndpoint: (p: string) =>
      (p.startsWith("http://") || p.startsWith("https://") ? p : `http://127.0.0.1:1234${p}`),
  };
});

vi.mock("@/components/Common/ImagePreviewDialog", () => ({
  showImagePreviewDialog: vi.fn(),
}));

import { ImageWrapper } from "../ImageWrapper";

describe("ImageWrapper", () => {
  beforeEach(() => {
    axiosGet.mockReset();
    window.localStorage.removeItem("blinkoToken");
    // JSDOM doesn't implement object URLs; stub them.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).URL.createObjectURL = vi.fn(() => "blob:mock");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).URL.revokeObjectURL = vi.fn();
  });

  it("fetches /api images as blobs and renders via object URL", async () => {
    axiosGet.mockResolvedValueOnce({ data: new Blob(["x"], { type: "image/png" }) });
    const { getByRole } = render(<ImageWrapper src="/api/file/test.png" alt="a" />);

    await waitFor(() => {
      expect(axiosGet).toHaveBeenCalledWith("http://127.0.0.1:1234/api/file/test.png", { responseType: "blob" });
    });
    await waitFor(() => {
      expect(getByRole("img", { name: "a" }).getAttribute("src")).toBe("blob:mock");
    });
  });

  it("prefers a direct ?token= URL when blinkoToken is present (no blob fetch)", async () => {
    window.localStorage.setItem("blinkoToken", JSON.stringify({ token: "abc" }));
    const { getByRole } = render(<ImageWrapper src="/api/file/test.png" alt="a" />);

    await waitFor(() => {
      expect(getByRole("img", { name: "a" }).getAttribute("src")).toBe(
        "http://127.0.0.1:1234/api/file/test.png?token=abc",
      );
    });
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it("does not fetch remote images", async () => {
    const { getByRole } = render(<ImageWrapper src="https://example.com/a.png" alt="a" />);
    expect(getByRole("img", { name: "a" }).getAttribute("src")).toBe("https://example.com/a.png");
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it("fetches absolute /api images as blobs and renders via object URL", async () => {
    axiosGet.mockResolvedValueOnce({ data: new Blob(["x"], { type: "image/png" }) });
    const { getByRole } = render(<ImageWrapper src="http://127.0.0.1:1234/api/file/test.png" alt="a" />);

    await waitFor(() => {
      expect(axiosGet).toHaveBeenCalledWith("http://127.0.0.1:1234/api/file/test.png", { responseType: "blob" });
    });
    await waitFor(() => {
      expect(getByRole("img", { name: "a" }).getAttribute("src")).toBe("blob:mock");
    });
  });
});
