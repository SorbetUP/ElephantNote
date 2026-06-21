<template>
  <section class="en-wiki-workspace">
    <header class="en-wiki-toolbar">
      <div>
        <p class="en-wiki-kicker">Wiki</p>
        <h1>{{ currentTitle }}</h1>
        <p>{{ visiblePath }}</p>
      </div>
      <div class="en-wiki-actions">
        <button type="button" :disabled="loading" @click="loadWikiDirectory">
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
        <button type="button" @click="createWikiFolder">New folder</button>
        <button type="button" @click="createWikiNote">New note</button>
      </div>
    </header>

    <nav class="en-wiki-breadcrumbs" aria-label="Wiki folder path">
      <button type="button" @click="openWikiPath(WIKI_ROOT)">Wiki</button>
      <template v-for="crumb in breadcrumbs" :key="crumb.path">
        <span>/</span>
        <button type="button" @click="openWikiPath(crumb.path)">{{ crumb.label }}</button>
      </template>
    </nav>

    <section class="en-wiki-explorer">
      <article
        v-if="currentWikiPath !== WIKI_ROOT"
        class="en-wiki-entry en-wiki-entry-parent"
        @click="openWikiPath(parentPath)"
      >
        <span class="en-wiki-entry-icon">↩</span>
        <div>
          <h2>Parent folder</h2>
          <p>{{ parentPathLabel }}</p>
        </div>
      </article>

      <article
        v-for="entry in entries"
        :key="entry.path"
        class="en-wiki-entry"
        @click="openEntry(entry)"
      >
        <span class="en-wiki-entry-icon">{{ entry.kind === 'folder' ? '📁' : '📄' }}</span>
        <div>
          <h2>{{ entry.title || entry.filename || basename(entry.path) }}</h2>
          <p>
            <span>{{ entry.kind === 'folder' ? `${entry.noteCount || 0} notes` : entry.excerpt || entry.filename }}</span>
            <span v-if="entry.updatedAt"> · {{ formatDate(entry.updatedAt) }}</span>
          </p>
        </div>
        <button
          v-if="entry.kind === 'note'"
          type="button"
          class="en-wiki-open-button"
          @click.stop="openNote(entry)"
        >
          Open
        </button>
      </article>

      <article v-if="!entries.length && !loading" class="en-wiki-empty-card">
        <h2>No wiki pages yet</h2>
        <p>
          This view is a file explorer scoped to the hidden vault folder
          <code>.elephantnote/wiki</code>. Create or move wiki notes there to show them here.
        </p>
      </article>

      <article v-if="error" class="en-wiki-error-card">
        <h2>Unable to load wiki folder</h2>
        <p>{{ error }}</p>
      </article>
    </section>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import log from 'electron-log/renderer'
import { useVaultStore } from '../../stores/vaultStore'
import { elephantnoteClient } from '../../services/elephantnoteClient'

const WIKI_ROOT = '.elephantnote/wiki'
const store = useVaultStore()
const entries = ref([])
const currentWikiPath = ref(WIKI_ROOT)
const loading = ref(false)
const error = ref('')

const basename = (value = '') => String(value || '').split('/').filter(Boolean).at(-1) || 'Wiki'
const currentTitle = computed(() => currentWikiPath.value === WIKI_ROOT ? 'Wiki' : basename(currentWikiPath.value))
const visiblePath = computed(() => currentWikiPath.value)
const relativeInsideWiki = computed(() => {
  const path = currentWikiPath.value
  if (path === WIKI_ROOT) return ''
  return path.startsWith(`${WIKI_ROOT}/`) ? path.slice(WIKI_ROOT.length + 1) : ''
})
const breadcrumbs = computed(() => {
  const parts = relativeInsideWiki.value.split('/').filter(Boolean)
  return parts.map((label, index) => ({
    label,
    path: [WIKI_ROOT, ...parts.slice(0, index + 1)].join('/')
  }))
})
const parentPath = computed(() => {
  if (currentWikiPath.value === WIKI_ROOT) return WIKI_ROOT
  const parts = currentWikiPath.value.split('/').filter(Boolean)
  parts.pop()
  return parts.join('/') || WIKI_ROOT
})
const parentPathLabel = computed(() => parentPath.value === WIKI_ROOT ? 'Wiki' : parentPath.value)

const formatDate = (value = '') => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

const openWikiPath = async (path = WIKI_ROOT) => {
  const normalized = String(path || WIKI_ROOT).replace(/\\/g, '/').replace(/\/+$/g, '') || WIKI_ROOT
  currentWikiPath.value = normalized.startsWith(WIKI_ROOT) ? normalized : WIKI_ROOT
  await loadWikiDirectory()
}

const loadWikiDirectory = async () => {
  if (!store.activeVault?.path) return
  loading.value = true
  error.value = ''
  log.info('[wiki] explorer:load:start', { path: currentWikiPath.value })
  try {
    const result = await elephantnoteClient.directory.list(currentWikiPath.value)
    entries.value = Array.isArray(result) ? result : []
    log.info('[wiki] explorer:load:done', { path: currentWikiPath.value, entries: entries.value.length })
  } catch (err) {
    entries.value = []
    error.value = err?.message || 'Unable to load wiki folder.'
    log.error('[wiki] explorer:load:failed', { path: currentWikiPath.value, error: err })
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
  openNote(entry)
}

const openNote = (entry) => {
  if (!entry?.path) return
  store.openNote({
    ...entry,
    kind: 'note',
    type: 'note',
    title: entry.title || entry.filename?.replace(/\.md$/i, '') || basename(entry.path)
  })
}

const createWikiNote = async () => {
  if (!store.activeVault?.path) return
  log.info('[wiki] explorer:create-note:start', { path: currentWikiPath.value })
  const result = await elephantnoteClient.notes.create(currentWikiPath.value)
  await loadWikiDirectory()
  if (result?.note?.path) {
    openNote({
      kind: 'note',
      type: 'note',
      path: result.note.path,
      title: basename(result.note.path).replace(/\.md$/i, ''),
      updatedAt: new Date().toISOString()
    })
  }
}

const createWikiFolder = async () => {
  if (!store.activeVault?.path) return
  log.info('[wiki] explorer:create-folder:start', { path: currentWikiPath.value })
  await elephantnoteClient.folders.create(currentWikiPath.value)
  await loadWikiDirectory()
}

onMounted(loadWikiDirectory)

watch(() => store.activeVaultId, () => {
  currentWikiPath.value = WIKI_ROOT
  loadWikiDirectory()
})
</script>

<style scoped>
.en-wiki-workspace {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 24px 24px;
  overflow: auto;
  background: var(--en-bg);
  color: var(--en-text);
}

.en-wiki-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  border: 1px solid var(--en-border);
  border-radius: 18px;
  background: var(--en-surface);
}

.en-wiki-toolbar h1,
.en-wiki-toolbar p {
  margin: 0;
}

.en-wiki-kicker {
  margin: 0 0 4px;
  color: var(--en-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 12px;
  font-weight: 700;
}

.en-wiki-actions,
.en-wiki-breadcrumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.en-wiki-actions button,
.en-wiki-breadcrumbs button,
.en-wiki-open-button {
  min-height: 34px;
  border: 1px solid var(--en-border);
  border-radius: 10px;
  padding: 0 12px;
  color: var(--en-text);
  background: var(--en-soft);
}

.en-wiki-actions button:hover,
.en-wiki-breadcrumbs button:hover,
.en-wiki-open-button:hover {
  border-color: var(--en-primary);
}

.en-wiki-breadcrumbs {
  color: var(--en-muted);
}

.en-wiki-breadcrumbs button {
  background: transparent;
}

.en-wiki-explorer {
  display: grid;
  gap: 8px;
}

.en-wiki-entry,
.en-wiki-empty-card,
.en-wiki-error-card {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--en-border);
  border-radius: 14px;
  background: var(--en-surface);
}

.en-wiki-entry {
  cursor: pointer;
}

.en-wiki-entry:hover {
  border-color: var(--en-primary);
  background: color-mix(in srgb, var(--en-primary) 8%, var(--en-surface));
}

.en-wiki-entry-icon {
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: var(--en-soft);
}

.en-wiki-entry h2,
.en-wiki-entry p,
.en-wiki-empty-card h2,
.en-wiki-empty-card p,
.en-wiki-error-card h2,
.en-wiki-error-card p {
  margin: 0;
}

.en-wiki-entry h2 {
  font-size: 15px;
}

.en-wiki-entry p,
.en-wiki-empty-card p,
.en-wiki-error-card p {
  color: var(--en-muted);
}

.en-wiki-empty-card,
.en-wiki-error-card {
  grid-template-columns: 1fr;
}

.en-wiki-error-card {
  border-color: var(--en-danger, #ef4444);
}

code {
  padding: 2px 5px;
  border-radius: 6px;
  background: var(--en-soft);
  color: var(--en-text);
}

@media (max-width: 760px) {
  .en-wiki-toolbar,
  .en-wiki-entry {
    grid-template-columns: 1fr;
    display: grid;
  }
}
</style>
