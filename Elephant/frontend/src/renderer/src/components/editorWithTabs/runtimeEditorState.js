export const applyRustEditorMarkdown = ({
  editorStore,
  file,
  editorMarkdown,
  fromEditorMarkdown = (markdown) => markdown,
  persist = () => {}
}) => {
  if (!file?.id) return false
  const sourceMarkdown = String(editorMarkdown || '')
  let nextMarkdown = fromEditorMarkdown(sourceMarkdown)

  // A trailing empty paragraph is a real editor state: it carries the caret
  // after Enter until the next character arrives. Some document adapters omit
  // only those final line breaks while round-tripping through the parent store.
  // Preserve them when that is the sole transformation, otherwise Vue feeds a
  // shorter value back into the editor and destroys/remounts the active Rust
  // session in the middle of the same visible keyboard interaction.
  if (
    sourceMarkdown.endsWith('\n') &&
    nextMarkdown === sourceMarkdown.replace(/\n+$/, '')
  ) {
    nextMarkdown = sourceMarkdown
  }

  if (file.markdown === nextMarkdown) return false

  file.markdown = nextMarkdown
  file.isSaved = false
  const index = editorStore.tabIdToIndex[file.id]
  if (index !== undefined && editorStore.tabs[index]) {
    editorStore.tabs[index].markdown = nextMarkdown
    editorStore.tabs[index].isSaved = false
  }
  persist()
  return true
}
