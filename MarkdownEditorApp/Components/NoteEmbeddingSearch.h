#ifndef NOTE_EMBEDDING_SEARCH_H
#define NOTE_EMBEDDING_SEARCH_H

#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define NES_DEFAULT_DIMENSIONS 192

typedef struct NoteEmbeddingIndex NoteEmbeddingIndex;

typedef struct NoteEmbeddingResult {
    size_t note_index;
    float score;
} NoteEmbeddingResult;

NoteEmbeddingIndex *nes_create(size_t dimensions);
void nes_destroy(NoteEmbeddingIndex *index);

bool nes_rebuild(NoteEmbeddingIndex *index,
                 const char * const *note_ids,
                 const char * const *contents,
                 size_t count);

size_t nes_count(const NoteEmbeddingIndex *index);
size_t nes_dimensions(const NoteEmbeddingIndex *index);
const char *nes_last_error(const NoteEmbeddingIndex *index);

void nes_embed_text(const char *text, float *embedding, size_t dimensions);

size_t nes_search(const NoteEmbeddingIndex *index,
                  const char *query,
                  float minimum_score,
                  NoteEmbeddingResult *results,
                  size_t max_results);

#ifdef __cplusplus
}
#endif

#endif
