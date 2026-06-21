<template>
  <section class="en-library en-wiki-library">
    <library-toolbar />
    <div
      class="en-library-grid"
      :class="{ list: store.viewMode === 'list' }"
    >
      <article
        v-if="currentWikiPath !== WIKI_ROOT"
        class="en-card en-wiki-parent-card"
        @click="openWikiPath(parentPath)"
      >
        <header>
          <span class="en-wiki-parent-icon">↩</span>
          <h2>Parent folder</h2>
        </header>
        <p>{{ parentPath === WIKI_ROOT ? 'Wiki' : parentPath }}</p>
      </article>

      <NoteCard
        v-for="(entry, index) in displayEntries"
        :key="entry.path"
        :entry="entry"
        :featured="index === 0 && displayEntries.length > 3"
        @open="openEntry"
        @rename="renameEntry"
        @delete="deleteEntry"
      />

      <article
        v-if="!displayEntries.length && !loading"
        class="en-card en-wiki-empty-card"
      >
        <h2>No wiki notes yet</h2>
        <p>
          This page mirrors the normal notes explorer, but its root is
          <code>.elephantnote/wiki</code> inside the active vault.
        </p>
      </article>

      <article
        v-if="error"
        class="en-card en-wiki-error-card"
      >
        <h2>Unable to load wiki</h2>
        <p>{{ error }}</p>
      </article>

      <form
        v-if="renamingEntry"
        class="en-library-rename-form"
        @submit.prevent="submitRenameEntry"
      >
        <span>Rename</span>
        <input
          ref="renameEntryInput"
          v-model.trim="renameEntryTitle"
          type="text"
          aria-label="Entry name"
          @keydown.esc="cancelRenameEntry"
        >
        <button type="submit">Save</button>
        <button type="button" @click="cancelRenameEntry">Cancel</button>
      </form>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import log from 'electron-log/renderer'
import { useVaultStore } from '../../stores/vaultStore'
import { elephantnoteClient } from '../../services/elephantnoteClient'
import LibraryToolbar from '../library/LibraryToolbar.vue'
import NoteCard from '../library/NoteCard.vue'

const WIKI_ROOT = '.elephantnote/wiki'
const store = useVaultStore()
const entries = ref([])
const currentWikiPath = ref(WIKI_ROOT)
const loading = ref(false)
const error = ref('')
const renamingEntry = ref(null)
const renameEntryTitle = ref('')
const renameEntryInput = ref(null)

const displayEntries = computed(() => entries.value)
const parentPath = computed(() => {
  if (currentWikiPath.value === WIKI_ROOT) return WIKI_ROOT
  const parts = currentWikiPath.value.split('/').filter(Boolean)
  parts.pop()
  return parts.join('/') || WIKI_ROOT
})

const openWikiPath = async (relativePath = WIKI_ROOT) => {
  const normalized = String(relativePath || WIKI_ROOT).replace(/\\/g, '/').replace(/\/+$/g, '') || WIKI_ROOT
  currentWikiPath.value = normalized.startsWith(WIKI_ROOT) ? normalized : WIKI_ROOT
  store.currentPath = currentWikiPath.value
  store.activeWorkspaceView = 'wiki'
  store.openedNotePath = ''
  await loadWikiDirectory()
}

const loadWikiDirectory = async () => {
  if (!store.activeVault?.path) return
  loading.value = true
  error.value = ''
  log.info('[wiki] library-explorer:load:start', { path: currentWikiPath.value })
  try {
    const result = await elephantnoteClient.directory.list(currentWikiPath.value)
    entries.value = Array.isArray(result) ? result : []
    store.entries = entries.value
    store.currentPath = currentWikiPath.value
    log.info('[wiki] library-explorer:load:done', { path: currentWikiPath.value, entries: entries.value.length })
  } catch (err) {
    entries.value = []
    store.entries = []
    error.value = err?.message || 'Unable to load wiki folder.'
    log.error('[wiki] library-explorer:load:failed', { path: currentWikiPath.value, error: err })
  } finally {
    loading.value = false
  }
}

const openEntry = (entry) => {
  if (!entry?.path) return
  if (entry.kind === 'folder') {
    openWikiPath(entry.path)
    return
  }
  store.openNote({ ...entry, kind: 'note', type: 'note' })
}

const renameEntry = async (entry) => {
  renamingEntry.value = entry
  renameEntryTitle.value = entry.title || entry.filename?.replace(/\.md$/i, '') || entry.path.split('/').pop()
  await nextTick()
  renameEntryInput.value?.focus()
  renameEntryInput.value?.select()
}

const cancelRenameEntry = () => {
  renamingEntry.value = null
  renameEntryTitle.value = ''
}

const submitRenameEntry = async () => {
  if (!renamingEntry.value) return
  const nextName = renameEntryTitle.value.trim()
  const entry = renamingEntry.value
  cancelRenameEntry()
  if (!nextName || nextName === entry.title) return
  await store.renameEntry(entry, nextName)
  await loadWikiDirectory()
}

const deleteEntry = async (entry) => {
  if (!window.confirm(`Delete "${entry.title}"? This cannot be undone.`)) return
  await store.deleteEntry(entry)
  await loadWikiDirectory()
}

onMounted(() => openWikiPath(currentWikiPath.value))
watch(() => store.activeVaultId, () => openWikiPath(WIKI_ROOT))
</script>

<style scoped>
.en-wiki-library {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--en-bg);
}

.en-library-grid {
  min-height: 0;
  column-width: 360px;
  column-gap: 18px;
  padding: 0 28px 32px;
  overflow-y: auto;
}

.en-library-grid :deep(.en-card),
.en-library-grid > .en-card {
  width: 100%;
  display: inline-flex;
  margin: 0 0 18px;
  break-inside: avoid;
}

.en-library-grid.list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  column-width: auto;
  column-gap: 0;
}

.en-library-grid.list :deep(.en-card),
.en-library-grid.list > .en-card {
  display: flex;
  margin: 0;
}

.en-wiki-parent-card,
.en-wiki-empty-card,
.en-wiki-error-card {
  min-height: 160px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 12px;
  padding: 22px;
  border: 1px solid var(--en-border);
  border-radius: 14px;
  color: var(--en-text);
  background: var(--en-surface);
  cursor: pointer;
}

.en-wiki-empty-card,
.en-wiki-error-card {
  cursor: default;
}

.en-wiki-error-card {
  border-color: var(--en-danger, #ef4444);
}

.en-wiki-parent-card header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.en-wiki-parent-icon {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--en-soft);
}

.en-wiki-parent-card h2,
.en-wiki-parent-card p,
.en-wiki-empty-card h2,
.en-wiki-empty-card p,
.en-wiki-error-card h2,
.en-wiki-error-card p {
  margin: 0;
}

.en-wiki-parent-card p,
.en-wiki-empty-card p,
.en-wiki-error-card p {
  color: var(--en-muted);
}

code {
  padding: 2px 5px;
  border-radius: 6px;
  background: var(--en-soft);
  color: var(--en-text);
}

.en-library-rename-form {
  position: fixed;
  left: 50%;
  top: 50%;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 12px;
  color: var(--en-text);
  background: var(--en-surface);
  transform: translate(-50%, -50%);
}
</style>
