import { describe, expect, it } from "vitest";
import { extractApiFileRefsFromMarkdown } from "../extractApiFileAttachments";

describe("extractApiFileRefsFromMarkdown", () => {
  it("extracts markdown image refs and keeps alt as name", () => {
    const out = extractApiFileRefsFromMarkdown("![excalidraw-1.png](/api/file/532)");
    expect(out).toEqual([
      { id: "532", path: "/api/file/532", name: "excalidraw-1.png", isImage: true },
    ]);
  });

  it("defaults to png name for image refs with empty alt", () => {
    const out = extractApiFileRefsFromMarkdown("![](/api/file/532)");
    expect(out).toEqual([{ id: "532", path: "/api/file/532", name: "api-file-532.png", isImage: true }]);
  });

  it("extracts plain /api/file/<id> refs even without markdown image syntax", () => {
    const out = extractApiFileRefsFromMarkdown("see /api/file/999");
    expect(out).toEqual([{ id: "999", path: "/api/file/999", name: "api-file-999", isImage: false }]);
  });

  it("dedupes by id and prefers markdown image entry over plain ref", () => {
    const out = extractApiFileRefsFromMarkdown("![a.png](/api/file/123) then /api/file/123");
    expect(out).toEqual([{ id: "123", path: "/api/file/123", name: "a.png", isImage: true }]);
  });
});

