import { describe, expect, it } from "vitest";
import { sanitizeBlobLinksWithAttachments } from "@/lib/markdown/sanitizeBlobLinks";

describe("sanitizeBlobLinksWithAttachments", () => {
  it("replaces blob links when attachment name matches", () => {
    const input =
      "On a: [excalidraw-1.png](blob:tauri://localhost/abc)\n" +
      "And img: ![excalidraw-1.png](blob:tauri://localhost/def)\n";
    const out = sanitizeBlobLinksWithAttachments(input, [
      { name: "excalidraw-1.png", path: "/api/file/excalidraw-1.png" },
    ]);
    expect(out).toContain("[excalidraw-1.png](/api/file/excalidraw-1.png)");
    expect(out).toContain("![excalidraw-1.png](/api/file/excalidraw-1.png)");
    expect(out).not.toContain("blob:");
  });

  it("keeps blob links when no attachment matches", () => {
    const input = "[x.png](blob:tauri://localhost/abc)";
    const out = sanitizeBlobLinksWithAttachments(input, [
      { name: "other.png", path: "/api/file/other.png" },
    ]);
    expect(out).toBe(input);
  });
});

