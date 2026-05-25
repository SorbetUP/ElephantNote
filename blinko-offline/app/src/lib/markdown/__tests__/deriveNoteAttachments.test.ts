import { describe, expect, it } from "vitest";
import { deriveNoteAttachments } from "../deriveNoteAttachments";

describe("deriveNoteAttachments", () => {
  it("returns existing attachments when markdown contains no /api/file refs", () => {
    const out = deriveNoteAttachments({
      content: "hello",
      attachments: [{ name: "a.png", path: "/api/file/1", type: "image/png", size: 1 } as any],
      noteId: 10,
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.path).toBe("/api/file/1");
  });

  it("adds derived attachment when markdown references /api/file/<id> not present in attachments", () => {
    const out = deriveNoteAttachments({
      content: "![x.png](/api/file/532)",
      attachments: [],
      noteId: 10,
    });
    expect(out).toEqual([
      { name: "x.png", path: "/api/file/532", type: "", size: 0, noteId: 10 },
    ]);
  });

  it("does not duplicate an attachment already present by id", () => {
    const out = deriveNoteAttachments({
      content: "![x.png](/api/file/532)",
      attachments: [{ name: "existing.png", path: "/api/file/532", type: "image/png", size: 1 } as any],
      noteId: 10,
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.name).toBe("existing.png");
  });
});

