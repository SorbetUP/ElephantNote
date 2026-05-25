import { describe, expect, it } from "vitest";
import { maskCredentialsContent } from "@/lib/notePrivacy";

describe("notePrivacy.maskCredentialsContent", () => {
  it("prefers explicit H1 title when present", () => {
    const content = "# Netflix\nuser: a@b.com\nmdp: 1234\n#credentials";
    expect(maskCredentialsContent(content)).toBe("# Netflix");
  });

  it("uses the first non-tag line as title when no H1 exists", () => {
    const content = "Netflix\nuser: a@b.com\nmdp: 1234\n#credentials";
    expect(maskCredentialsContent(content)).toBe("# Netflix");
  });

  it("skips leading tag lines and uses the next meaningful line", () => {
    const content = "#credentials\n\nNetflix\nuser: a@b.com\nmdp: 1234";
    expect(maskCredentialsContent(content)).toBe("# Netflix");
  });
});

