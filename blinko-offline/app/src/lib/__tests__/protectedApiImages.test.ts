import { describe, expect, it, vi } from "vitest";
import { createProtectedApiImageResolver } from "@/lib/media/protectedApiImages";

describe("createProtectedApiImageResolver", () => {
  it("replaces /api img src with an object URL using fetchBlob()", async () => {
    window.localStorage.removeItem("blinkoToken");
    const fetchBlob = vi.fn(async () => new Blob(["x"], { type: "image/png" }));
    // JSDOM: stub object URL.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).URL.createObjectURL = vi.fn(() => "blob:mock");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).URL.revokeObjectURL = vi.fn();

    const root = document.createElement("div");
    const img = document.createElement("img");
    img.setAttribute("src", "http://127.0.0.1:1234/api/file/a.png");
    root.appendChild(img);

    const r = createProtectedApiImageResolver({
      fetchBlob,
      toAbsolute: (p) => p,
    });
    r.resolveIn(root);

    // allow promise chain to flush
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchBlob).toHaveBeenCalledWith("http://127.0.0.1:1234/api/file/a.png");
    expect(img.getAttribute("src")).toBe("blob:mock");
    r.disconnect();
  });

  it("prefers a direct ?token= URL when blinkoToken is present (no blob fetch)", async () => {
    window.localStorage.setItem("blinkoToken", JSON.stringify({ token: "abc" }));
    const fetchBlob = vi.fn(async () => new Blob(["x"], { type: "image/png" }));

    const root = document.createElement("div");
    const img = document.createElement("img");
    img.setAttribute("src", "http://127.0.0.1:1234/api/file/a.png");
    root.appendChild(img);

    const r = createProtectedApiImageResolver({
      fetchBlob,
      toAbsolute: (p) => p,
    });
    r.resolveIn(root);

    // allow sync path to apply
    expect(fetchBlob).not.toHaveBeenCalled();
    expect(img.getAttribute("src")).toBe("http://127.0.0.1:1234/api/file/a.png?token=abc");
    r.disconnect();
  });

  it("replaces /api img data-src with an object URL and removes data-src", async () => {
    window.localStorage.removeItem("blinkoToken");
    const fetchBlob = vi.fn(async () => new Blob(["x"], { type: "image/png" }));
    // JSDOM: stub object URL.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).URL.createObjectURL = vi.fn(() => "blob:mock");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).URL.revokeObjectURL = vi.fn();

    const root = document.createElement("div");
    const img = document.createElement("img");
    img.setAttribute("data-src", "/api/file/a.png");
    root.appendChild(img);

    const r = createProtectedApiImageResolver({
      fetchBlob,
      toAbsolute: (p) => p,
    });
    r.resolveIn(root);

    // allow promise chain to flush
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchBlob).toHaveBeenCalledWith("/api/file/a.png");
    expect(img.getAttribute("src")).toBe("blob:mock");
    expect(img.getAttribute("data-src")).toBeNull();
    r.disconnect();
  });
});
