<template>
  <div class="tauri-note-app">
    <aside class="tauri-sidebar">
      <header class="tauri-sidebar__header">
        <div>
          <strong>{{ activeVaultName }}</strong>
          <p>{{ activeVaultPath || 'No vault selected' }}</p>
        </div>
        <button @click="selectVault">Vault</button>
      </header>

      <div class="tauri-sidebar__actions">
        <button @click="createFolder">New folder</button>
        <button @click="createNote">New note</button>
        <button @click="rebuildSearch">Rebuild search</button>
      </div>

      <div class="tauri-entry-list">
        <button
          v-for="entry in entries"
          :key="entry.path"
          class="tauri-entry"
          :class="{ 'is-active': entry.path === activePath }"
          @click="openEntry(entry)"
        >
          <span>{{ entry.kind === 'folder' ? '▸' : '•' }}</span>
          <div>
            <strong>{{ entry.title || entry.filename || entry.path }}</strong>
            <small>{{ entry.path }}</small>
          </div>
        </button>
      </div>
    </aside>

    <main class="tauri-editor-shell">
      <header class="tauri-editor-toolbar">
        <div>
          <strong>{{ activePath || 'Select or create a note' }}</strong>
          <p>{{ status }}</p>
        </div>
        <div class="tauri-editor-toolbar__actions">
          <button :disabled="!activePath" @click="saveNote">Save</button>
          <button :disabled="!activePath" @click="renderPreview">Preview</button>
        </div>
      </header>

      <section class="tauri-editor-grid">
        <textarea
          v-model="content"
          class="tauri-editor"
          spellcheck="false"
          placeholder="Write Markdown here..."
          @input="dirty = true"
        />
        <article class="tauri-preview" v-html="html" />
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'

const bridge = () => window.elephantnote
const vaultState = ref(null)
const entries = ref([])
const activePath = ref('')
const content = ref('')
const html = ref('')
const status = ref('Ready')
const dirty = ref(false)

const activeVault = computed(() => vaultState.value?.activeVault || null)
const activeVaultName = computed(() => activeVault.value?.name || 'Elephant Tauri')
const activeVaultPath = computed(() => activeVault.value?.path || '')

const setStatus = (value) => {
  status.value = value
}

const refreshVault = async() => {
  const state = await bridge().getVaults()
  vaultState.value = state
  entries.value = state?.entries || []
  return state
}

const selectVault = async() => {
  setStatus('Selecting vault...')
  const state = await bridge().selectVault()
  vaultState.value = state
  entries.value = state?.entries || []
  setStatus('Vault ready')
}

const openEntry = async(entry) => {
  if (entry.kind === 'folder') {
    setStatus(`Opening folder ${entry.path}`)
    entries.value = await bridge().listDirectory(entry.path)
    return
  }
  activePath.value = entry.path
  setStatus(`Reading ${entry.path}`)
  const note = await bridge().readNote({ relativePath: entry.path })
  content.value = note.content || ''
  dirty.value = false
  await renderPreview()
  setStatus(`Opened ${entry.path}`)
}

const createFolder = async() => {
  setStatus('Creating folder...')
  const result = await bridge().createFolder({ relativePath: '' })
  entries.value = result?.entries || await bridge().listDirectory('')
  setStatus('Folder created')
}

const createNote = async() => {
  setStatus('Creating note...')
  const result = await bridge().createNote({ relativePath: '' })
  entries.value = result?.entries || await bridge().listDirectory('')
  const notePath = result?.note?.path
  if (notePath) {
    await openEntry({ kind: 'note', path: notePath, title: result.note.title })
  }
  setStatus('Note created')
}

const saveNote = async() => {
  if (!activePath.value) return
  setStatus(`Saving ${activePath.value}`)
  await bridge().writeNote({ relativePath: activePath.value, content: content.value })
  dirty.value = false
  await renderPreview()
  setStatus(`Saved ${activePath.value}`)
}

const renderPreview = async() => {
  const result = await bridge().markdown.renderHtml(content.value)
  html.value = result?.html || ''
}

const rebuildSearch = async() => {
  setStatus('Rebuilding search index...')
  await bridge().search.rebuild()
  setStatus('Search index rebuilt')
}

onMounted(async() => {
  try {
    await refreshVault()
    if (!activeVault.value) {
      setStatus('Select a vault to start')
    }
  } catch (error) {
    setStatus(error?.message || String(error))
  }
})
</script>

<style scoped>
.tauri-note-app {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  width: 100vw;
  height: 100vh;
  background: #202124;
  color: #f5f5f5;
}

.tauri-sidebar {
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  background: #18191b;
  min-width: 0;
}

.tauri-sidebar__header,
.tauri-editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.tauri-sidebar__header p,
.tauri-editor-toolbar p {
  margin: 4px 0 0;
  color: #a8adb5;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
}

.tauri-sidebar__actions,
.tauri-editor-toolbar__actions {
  display: flex;
  gap: 8px;
  padding: 12px;
}

button {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  padding: 7px 10px;
  cursor: pointer;
}

button:disabled {
  opacity: 0.5;
  cursor: default;
}

.tauri-entry-list {
  overflow: auto;
  padding: 8px;
}

.tauri-entry {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 8px;
  width: 100%;
  text-align: left;
  margin-bottom: 6px;
  padding: 10px;
}

.tauri-entry.is-active {
  background: rgba(255, 255, 255, 0.16);
}

.tauri-entry small {
  display: block;
  color: #a8adb5;
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tauri-editor-shell {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.tauri-editor-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 0;
  flex: 1;
}

.tauri-editor,
.tauri-preview {
  min-width: 0;
  padding: 24px;
  overflow: auto;
}

.tauri-editor {
  resize: none;
  border: 0;
  outline: 0;
  background: #202124;
  color: #f5f5f5;
  font: 15px/1.6 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.tauri-preview {
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  background: #242528;
  color: #f5f5f5;
  font: 15px/1.6 system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif;
}

.tauri-preview :deep(a) {
  color: #8ab4f8;
}

.tauri-preview :deep(pre) {
  background: rgba(0, 0, 0, 0.25);
  padding: 12px;
  border-radius: 10px;
  overflow: auto;
}
</style>
