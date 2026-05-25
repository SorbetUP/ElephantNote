import { describe, expect, test } from "bun:test";

import { GoogleKeepImporter } from "../jobs/googleKeepJob";
import { __test__ as syncNotesTest } from "../lib/sync_notes";

describe("google keep import tag generation", () => {
  test("does not treat imported title as a hashtag", () => {
    const importer = new GoogleKeepImporter() as any;
    const content = importer.buildContent(
      { title: "Model bio", textContent: "Fenetre fovea : 4 lignes..." },
      [],
      false,
      false,
    );

    const tags = syncNotesTest.extractHashtagsForSync(content);
    expect(tags).not.toContain("#Model");
    expect(tags).not.toContain("#model");
  });

  test("normalizes Keep labels into valid, stable hashtags", () => {
    const importer = new GoogleKeepImporter() as any;
    const content = importer.buildContent(
      {
        title: "Test",
        textContent: "hello",
        labels: [
          { name: "Informatique" },
          { name: "3d printing" },
          { name: "ID_Film" },
          { name: "Projet/Math" },
        ],
      },
      [],
      false,
      false,
    );

    const tags = syncNotesTest.extractHashtagsForSync(content);
    expect(tags).toContain("#informatique");
    expect(tags).toContain("#3d-printing");
    expect(tags).toContain("#id_film");
    expect(tags).toContain("#projet/math");
  });

  test("drops labels that would become path/shebang junk", () => {
    const importer = new GoogleKeepImporter() as any;
    const content = importer.buildContent(
      {
        title: "Test",
        textContent: "hello",
        labels: [{ name: "#!/usr/bin/env" }, { name: "#/usr/bin/env" }],
      },
      [],
      false,
      false,
    );

    const tags = syncNotesTest.extractHashtagsForSync(content);
    expect(tags).not.toContain("#!/usr/bin/env");
    expect(tags).not.toContain("#/usr/bin/env");
    expect(tags).not.toContain("#usr/bin/env");
  });

  test("can ignore text hashtags to avoid noisy tag explosion", () => {
    const importer = new GoogleKeepImporter() as any;
    const content = importer.buildContent(
      {
        title: "Test",
        textContent: "#japon hello",
        labels: [{ name: "Voyage" }],
      },
      [],
      false,
      false,
    );

    const tags = syncNotesTest.extractHashtagsForSync(content);
    expect(content).toContain("＃japon");
    expect(tags).not.toContain("#japon");
    expect(tags).toContain("#voyage");
  });

  test("can ignore title hashtags to avoid noisy tag explosion", () => {
    const importer = new GoogleKeepImporter() as any;
    const content = importer.buildContent(
      {
        title: "10€ pour MANGER #japon",
        textContent: "hello",
        labels: [{ name: "Voyage" }],
      },
      [],
      false,
      false,
    );

    const tags = syncNotesTest.extractHashtagsForSync(content);
    expect(content).toContain("＃japon");
    expect(tags).not.toContain("#japon");
    expect(tags).toContain("#voyage");
  });
});
