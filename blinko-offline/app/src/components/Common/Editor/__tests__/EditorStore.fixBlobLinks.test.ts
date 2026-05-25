import { describe, expect, it, vi } from "vitest";
import { EditorStore } from "../editorStore";

describe("EditorStore.fixBlobLinksInCurrentContent", () => {
  it("rewrites blob links when a matching file has a stable preview/upload path", () => {
    const s = new EditorStore();
    const setValue = vi.fn();
    const onChange = vi.fn();

    s.vditor = {
      getValue: () => "[a.png](blob:tauri://localhost/abc)",
      setValue,
    } as any;
    s.onChange = onChange;
    s.files = [
      {
        name: "a.png",
        preview: "/api/file/a.png",
        uploadPromise: { value: "" },
      } as any,
    ];

    s.fixBlobLinksInCurrentContent();
    expect(setValue).toHaveBeenCalledWith("[a.png](/api/file/a.png)");
    expect(onChange).toHaveBeenCalledWith("[a.png](/api/file/a.png)");
  });
});

