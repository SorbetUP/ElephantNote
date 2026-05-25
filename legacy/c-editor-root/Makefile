# Minimal build for the base editor/search libraries.

CC = clang
OBJC_FLAGS = -x objective-c -fobjc-arc -fobjc-weak
CFLAGS = -std=c11 -Wall -Wextra -O2 -g
FRAMEWORKS = -framework Cocoa -framework Foundation

COMPONENT_DIR = MarkdownEditorApp/Components
COMPONENT_LIB = $(COMPONENT_DIR)/libmarkdown_editor_components.a

COMPONENT_SOURCES = \
	$(COMPONENT_DIR)/MarkdownDocumentIO.m \
	$(COMPONENT_DIR)/MarkdownEditorDocument.m \
	$(COMPONENT_DIR)/MarkdownEditorDocumentController.m \
	$(COMPONENT_DIR)/MarkdownEditorRenderer.m \
	$(COMPONENT_DIR)/MarkdownEditor.m \
	$(COMPONENT_DIR)/NoteEmbeddingSearch.c

COMPONENT_OBJECTS = $(patsubst %.m,%.o,$(patsubst %.c,%.o,$(COMPONENT_SOURCES)))

TEST_SOURCES = $(COMPONENT_DIR)/MarkdownEditorRendererTests.m
TEST_OBJECTS = $(TEST_SOURCES:.m=.o)
TEST_BINARY = $(COMPONENT_DIR)/markdown_editor_renderer_tests

EMBEDDING_TEST_SOURCES = $(COMPONENT_DIR)/NoteEmbeddingSearchTests.c
EMBEDDING_TEST_OBJECTS = $(EMBEDDING_TEST_SOURCES:.c=.o)
EMBEDDING_TEST_BINARY = $(COMPONENT_DIR)/note_embedding_search_tests

all: $(COMPONENT_LIB)

$(COMPONENT_LIB): $(COMPONENT_OBJECTS)
	@echo "📦 Creating base component library..."
	@ar rcs $@ $^

%.o: %.m
	@echo "🔨 Compiling $<..."
	$(CC) $(OBJC_FLAGS) $(CFLAGS) -c $< -o $@

%.o: %.c
	@echo "🔨 Compiling $<..."
	$(CC) $(CFLAGS) -c $< -o $@

test: $(TEST_BINARY) $(EMBEDDING_TEST_BINARY)
	@echo "🧪 Running base library tests..."
	@./$(TEST_BINARY)
	@./$(EMBEDDING_TEST_BINARY)

$(TEST_BINARY): $(TEST_OBJECTS) $(COMPONENT_LIB)
	@echo "🔗 Linking renderer tests..."
	$(CC) $(FRAMEWORKS) $(TEST_OBJECTS) $(COMPONENT_LIB) -o $@

$(EMBEDDING_TEST_BINARY): $(EMBEDDING_TEST_OBJECTS) $(COMPONENT_DIR)/NoteEmbeddingSearch.o
	@echo "🔗 Linking embedding search tests..."
	$(CC) $(EMBEDDING_TEST_OBJECTS) $(COMPONENT_DIR)/NoteEmbeddingSearch.o -lm -o $@

clean:
	@echo "🧹 Cleaning base build artifacts..."
	@rm -f $(COMPONENT_OBJECTS)
	@rm -f $(TEST_OBJECTS) $(TEST_BINARY)
	@rm -f $(EMBEDDING_TEST_OBJECTS) $(EMBEDDING_TEST_BINARY)
	@rm -f $(COMPONENT_LIB)
	@echo "✅ Cleaned"

.PHONY: all clean test
