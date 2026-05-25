import { describe, expect, it } from "vitest";
import { applyEditorFullscreenLayoutFix } from "../fullscreenLayoutFix";

describe("applyEditorFullscreenLayoutFix", () => {
  it("neutralizes transforms/filters on known layout containers and restores them", () => {
    const outer = document.createElement("div");
    outer.id = "outer-container";
    outer.style.transform = "translate3d(1px, 2px, 3px)";
    outer.style.filter = "blur(2px)";
    document.body.appendChild(outer);

    const pageWrap = document.createElement("main");
    pageWrap.id = "page-wrap";
    pageWrap.style.transform = "translateX(10px)";
    document.body.appendChild(pageWrap);

    document.body.style.overflow = "auto";
    document.documentElement.style.overflow = "auto";

    const restore = applyEditorFullscreenLayoutFix();

    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(outer.style.transform).toBe("none");
    expect(outer.style.filter).toBe("none");
    expect(pageWrap.style.transform).toBe("none");

    restore();

    expect(document.body.style.overflow).toBe("auto");
    expect(document.documentElement.style.overflow).toBe("auto");
    expect(outer.style.transform).toBe("translate3d(1px, 2px, 3px)");
    expect(outer.style.filter).toBe("blur(2px)");
    expect(pageWrap.style.transform).toBe("translateX(10px)");
  });

  it("neutralizes any transformed ancestors above the editor anchor", () => {
    const a = document.createElement("div");
    a.style.transform = "translateX(10px)";
    document.body.appendChild(a);

    const b = document.createElement("div");
    b.style.filter = "blur(1px)";
    a.appendChild(b);

    const anchor = document.createElement("div");
    anchor.id = "vditor-create";
    b.appendChild(anchor);

    const restore = applyEditorFullscreenLayoutFix({ anchorEl: anchor });

    expect(a.style.transform).toBe("none");
    expect(b.style.filter).toBe("none");

    restore();
    expect(a.style.transform).toBe("translateX(10px)");
    expect(b.style.filter).toBe("blur(1px)");
  });
});
