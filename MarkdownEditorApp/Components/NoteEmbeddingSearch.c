#include "NoteEmbeddingSearch.h"

#include <ctype.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

struct NoteEmbeddingIndex {
    size_t dimensions;
    size_t count;
    char **note_ids;
    float *embeddings;
    char last_error[160];
};

static const uint64_t NES_FNV_OFFSET = 1469598103934665603ULL;
static const uint64_t NES_FNV_PRIME = 1099511628211ULL;

static uint64_t nes_hash_byte(uint64_t hash, unsigned char value) {
    hash ^= (uint64_t)value;
    hash *= NES_FNV_PRIME;
    return hash;
}

static void nes_set_error(NoteEmbeddingIndex *index, const char *message) {
    if (!index) {
        return;
    }
    if (!message) {
        index->last_error[0] = '\0';
        return;
    }
    snprintf(index->last_error, sizeof(index->last_error), "%s", message);
}

static char *nes_strdup(const char *value) {
    const char *safe_value = value ? value : "";
    size_t length = strlen(safe_value);
    char *copy = (char *)malloc(length + 1);
    if (!copy) {
        return NULL;
    }
    memcpy(copy, safe_value, length + 1);
    return copy;
}

static void nes_add_feature(float *embedding, size_t dimensions, uint64_t hash, float weight) {
    if (!embedding || dimensions == 0) {
        return;
    }
    size_t slot = (size_t)(hash % dimensions);
    embedding[slot] += (hash & 1ULL) ? weight : -weight;
}

static bool nes_is_token_byte(unsigned char value) {
    return isalnum(value) || value == '_' || value >= 128;
}

static unsigned char nes_fold_byte(unsigned char value) {
    if (value < 128) {
        return (unsigned char)tolower(value);
    }
    return value;
}

static void nes_normalize(float *embedding, size_t dimensions) {
    double length_squared = 0.0;
    for (size_t i = 0; i < dimensions; i++) {
        length_squared += (double)embedding[i] * (double)embedding[i];
    }
    if (length_squared <= 0.0000001) {
        return;
    }
    float inverse_length = (float)(1.0 / sqrt(length_squared));
    for (size_t i = 0; i < dimensions; i++) {
        embedding[i] *= inverse_length;
    }
}

void nes_embed_text(const char *text, float *embedding, size_t dimensions) {
    if (!embedding || dimensions == 0) {
        return;
    }
    memset(embedding, 0, sizeof(float) * dimensions);
    if (!text || text[0] == '\0') {
        return;
    }

    uint64_t token_hash = NES_FNV_OFFSET;
    size_t token_length = 0;
    unsigned char gram[3] = {0, 0, 0};
    size_t gram_length = 0;

    for (const unsigned char *cursor = (const unsigned char *)text;; cursor++) {
        unsigned char value = *cursor;
        bool token_byte = value != '\0' && nes_is_token_byte(value);
        if (token_byte) {
            unsigned char folded = nes_fold_byte(value);
            token_hash = nes_hash_byte(token_hash, folded);
            token_length++;

            gram[0] = gram[1];
            gram[1] = gram[2];
            gram[2] = folded;
            if (gram_length < 3) {
                gram_length++;
            }
            if (gram_length == 3) {
                uint64_t gram_hash = NES_FNV_OFFSET;
                gram_hash = nes_hash_byte(gram_hash, gram[0]);
                gram_hash = nes_hash_byte(gram_hash, gram[1]);
                gram_hash = nes_hash_byte(gram_hash, gram[2]);
                nes_add_feature(embedding, dimensions, gram_hash, 0.35f);
            }
            continue;
        }

        if (token_length > 0) {
            float token_weight = 1.0f;
            if (token_length >= 9) {
                token_weight = 1.3f;
            } else if (token_length <= 2) {
                token_weight = 0.45f;
            }
            nes_add_feature(embedding, dimensions, token_hash, token_weight);
            token_hash = NES_FNV_OFFSET;
            token_length = 0;
            gram[0] = gram[1] = gram[2] = 0;
            gram_length = 0;
        }

        if (value == '\0') {
            break;
        }
    }

    nes_normalize(embedding, dimensions);
}

NoteEmbeddingIndex *nes_create(size_t dimensions) {
    NoteEmbeddingIndex *index = (NoteEmbeddingIndex *)calloc(1, sizeof(NoteEmbeddingIndex));
    if (!index) {
        return NULL;
    }
    index->dimensions = dimensions > 0 ? dimensions : NES_DEFAULT_DIMENSIONS;
    return index;
}

static void nes_clear(NoteEmbeddingIndex *index) {
    if (!index) {
        return;
    }
    for (size_t i = 0; i < index->count; i++) {
        free(index->note_ids[i]);
    }
    free(index->note_ids);
    free(index->embeddings);
    index->note_ids = NULL;
    index->embeddings = NULL;
    index->count = 0;
}

void nes_destroy(NoteEmbeddingIndex *index) {
    if (!index) {
        return;
    }
    nes_clear(index);
    free(index);
}

bool nes_rebuild(NoteEmbeddingIndex *index,
                 const char * const *note_ids,
                 const char * const *contents,
                 size_t count) {
    if (!index) {
        return false;
    }

    nes_set_error(index, NULL);
    char **new_ids = NULL;
    float *new_embeddings = NULL;

    if (count > 0) {
        new_ids = (char **)calloc(count, sizeof(char *));
        new_embeddings = (float *)calloc(count * index->dimensions, sizeof(float));
        if (!new_ids || !new_embeddings) {
            free(new_ids);
            free(new_embeddings);
            nes_set_error(index, "allocation failed while rebuilding note embedding index");
            return false;
        }

        for (size_t i = 0; i < count; i++) {
            const char *note_id = note_ids ? note_ids[i] : NULL;
            const char *content = contents ? contents[i] : NULL;
            new_ids[i] = nes_strdup(note_id);
            if (!new_ids[i]) {
                for (size_t j = 0; j < i; j++) {
                    free(new_ids[j]);
                }
                free(new_ids);
                free(new_embeddings);
                nes_set_error(index, "allocation failed while copying note ids");
                return false;
            }
            nes_embed_text(content, new_embeddings + (i * index->dimensions), index->dimensions);
        }
    }

    nes_clear(index);
    index->note_ids = new_ids;
    index->embeddings = new_embeddings;
    index->count = count;
    return true;
}

size_t nes_count(const NoteEmbeddingIndex *index) {
    return index ? index->count : 0;
}

size_t nes_dimensions(const NoteEmbeddingIndex *index) {
    return index ? index->dimensions : 0;
}

const char *nes_last_error(const NoteEmbeddingIndex *index) {
    if (!index || index->last_error[0] == '\0') {
        return "";
    }
    return index->last_error;
}

static float nes_dot_product(const float *left, const float *right, size_t dimensions) {
    float score = 0.0f;
    for (size_t i = 0; i < dimensions; i++) {
        score += left[i] * right[i];
    }
    return score;
}

static void nes_insert_result(NoteEmbeddingResult *results,
                              size_t *result_count,
                              size_t max_results,
                              size_t note_index,
                              float score) {
    if (!results || max_results == 0) {
        return;
    }

    size_t insert_at = *result_count;
    while (insert_at > 0 && results[insert_at - 1].score < score) {
        if (insert_at < max_results) {
            results[insert_at] = results[insert_at - 1];
        }
        insert_at--;
    }

    if (insert_at >= max_results) {
        return;
    }

    results[insert_at].note_index = note_index;
    results[insert_at].score = score;
    if (*result_count < max_results) {
        (*result_count)++;
    }
}

size_t nes_search(const NoteEmbeddingIndex *index,
                  const char *query,
                  float minimum_score,
                  NoteEmbeddingResult *results,
                  size_t max_results) {
    if (!index || !query || query[0] == '\0' || !results || max_results == 0) {
        return 0;
    }

    float *query_embedding = (float *)calloc(index->dimensions, sizeof(float));
    if (!query_embedding) {
        return 0;
    }

    nes_embed_text(query, query_embedding, index->dimensions);

    size_t result_count = 0;
    for (size_t i = 0; i < index->count; i++) {
        const float *note_embedding = index->embeddings + (i * index->dimensions);
        float score = nes_dot_product(query_embedding, note_embedding, index->dimensions);
        if (score >= minimum_score) {
            nes_insert_result(results, &result_count, max_results, i, score);
        }
    }

    free(query_embedding);
    return result_count;
}
