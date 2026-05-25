#include "NoteEmbeddingSearch.h"

#include <stdio.h>

static int expect_true(int condition, const char *label) {
    if (condition) {
        return 0;
    }
    fprintf(stderr, "FAIL: %s\n", label);
    return 1;
}

int main(void) {
    int failures = 0;
    NoteEmbeddingIndex *index = nes_create(0);
    failures += expect_true(index != NULL, "create index");
    if (!index) {
        return failures;
    }

    const char *ids[] = {"a", "b", "c"};
    const char *contents[] = {
        "# Recette pain\n\nLevain, farine, cuisson lente.",
        "# Recherche vectorielle\n\nEmbeddings, cosine similarity, index de notes.",
        "# Jardin\n\nSemis de printemps et arrosage."
    };

    failures += expect_true(nes_rebuild(index, ids, contents, 3), "rebuild index");
    failures += expect_true(nes_count(index) == 3, "index count");
    failures += expect_true(nes_dimensions(index) == NES_DEFAULT_DIMENSIONS, "default dimensions");

    NoteEmbeddingResult results[3];
    size_t count = nes_search(index, "embedding recherche notes", 0.01f, results, 3);
    failures += expect_true(count > 0, "search returns results");
    failures += expect_true(results[0].note_index == 1, "semantic note ranks first");

    count = nes_search(index, "levain cuisson", 0.01f, results, 3);
    failures += expect_true(count > 0, "second search returns results");
    failures += expect_true(results[0].note_index == 0, "recipe note ranks first");

    count = nes_search(index, "", 0.01f, results, 3);
    failures += expect_true(count == 0, "empty query returns no results");

    nes_destroy(index);
    return failures == 0 ? 0 : 1;
}
