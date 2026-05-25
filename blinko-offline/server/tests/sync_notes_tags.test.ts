import { describe, expect, test } from "bun:test";

import { __test__, shouldApplyLww } from "../lib/sync_notes";

describe("sync_notes LWW", () => {
  test("prefers incoming when local missing timestamp", () => {
    expect(shouldApplyLww(null, "a", new Date("2024-01-01T00:00:00Z"), "b")).toBe(true);
  });

  test("prefers newer updated_at", () => {
    expect(shouldApplyLww(new Date("2024-01-01T00:00:00Z"), "a", new Date("2024-01-01T00:00:01Z"), "b")).toBe(true);
    expect(shouldApplyLww(new Date("2024-01-01T00:00:01Z"), "a", new Date("2024-01-01T00:00:00Z"), "b")).toBe(false);
  });

  test("tie breaks by device_id", () => {
    const t = new Date("2024-01-01T00:00:00Z");
    expect(shouldApplyLww(t, "device-a", t, "device-b")).toBe(true);
    expect(shouldApplyLww(t, "device-b", t, "device-a")).toBe(false);
  });
});

describe("sync_notes hashtag parsing (no shebang/path junk)", () => {
  test("filters #/path, #!/shebang, short numeric; keeps hierarchy and trailing punctuation", () => {
    const input = `
hello #alpha #!/usr/bin/env #/usr/bin/env #0 #14 #2024 #Projet/Math #course, #code.
\`\`\`sh
#should_not_be_seen
\`\`\`
`;
    const tags = __test__.extractHashtagsForSync(input);

    expect(tags).toContain("#alpha");
    expect(tags).toContain("#2024");
    expect(tags).toContain("#Projet/Math");
    expect(tags).toContain("#course");
    expect(tags).toContain("#code");

    expect(tags).not.toContain("#/usr/bin/env");
    expect(tags).not.toContain("#!/usr/bin/env");
    expect(tags).not.toContain("#0");
    expect(tags).not.toContain("#14");
    expect(tags).not.toContain("#should_not_be_seen");
  });

  test("validates hierarchical segments", () => {
    const input = "#ok #foo/bar-baz #foo//bar #-nope #nope-/x #nope./x #nope/--bad";
    const tags = __test__.extractHashtagsForSync(input);

    expect(tags).toContain("#ok");
    expect(tags).toContain("#foo/bar-baz");
    expect(tags).toContain("#nope-/x");

    expect(tags).not.toContain("#foo//bar");
    expect(tags).not.toContain("#-nope");
    expect(tags).not.toContain("#nope./x");
    expect(tags).not.toContain("#nope/--bad");
  });
});
