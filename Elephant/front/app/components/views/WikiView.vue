<template>
  <section class="en-library en-wiki-library">
    <library-toolbar />
    <library-grid />
  </section>
</template>

<script setup>
import { onMounted, watch } from 'vue'
import log from 'electron-log/renderer'
import { useVaultStore } from '../../stores/vaultStore'
import { elephantnoteClient } from '../../services/elephantnoteClient'
import LibraryToolbar from '../library/LibraryToolbar.vue'
import LibraryGrid from '../library/LibraryGrid.vue'

const WIKI_ROOT = '.elephantnote/wiki'
const WIKI_PAGE_LIMIT = 121
const store = useVaultStore()

const normalizeWikiPath = (relativePath = WIKI_ROOT) => {
  const normalized = String(relativePath || WIKI_ROOT)
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
  if (!normalized || normalized === WIKI_ROOT) return WIKI_ROOT
  return normalized.startsWith(`${WIKI_ROOT}/`) ? normalized : WIKI_ROOT
}

const wikiDirectoryPayload = (relativePath) => ({
  relativePath,
  offset: 0,
  limit: WIKI_PAGE_LIMIT,
  includePreview: true
})

const shouldApplyWikiDirectoryResult = (wikiPath, vaultId) => {
  return store.activeWorkspaceView === 'wiki' &&
    store.currentPath === wikiPath &&
    store.activeVaultId === vaultId
}

const loadWikiDirectory = async (relativePath = WIKI_ROOT) => {
  const wikiPath = normalizeWikiPath(relativePath)
  const vaultId = store.activeVaultId
  store.currentPath = wikiPath
  store.activeWorkspaceView = 'wiki'
  store.openedNotePath = ''
  store.entries = []

  if (!store.activeVault?.path) {
    return
  }

  try {
    const entries = await elephantnoteClient.directory.list(wikiDirectoryPayload(wikiPath))
    if (!shouldApplyWikiDirectoryResult(wikiPath, vaultId)) return
    store.entries = Array.isArray(entries) ? entries : []
    store.currentPath = wikiPath
    store.activeWorkspaceView = 'wiki'
    log.info('[wiki] opened library directory', {
      root: WIKI_ROOT,
      path: wikiPath,
      entries: store.entries.length
    })
  } catch (error) {
    if (!shouldApplyWikiDirectoryResult(wikiPath, vaultId)) return
    store.entries = []
    store.currentPath = wikiPath
    store.activeWorkspaceView = 'wiki'
    log.info('[wiki] library directory empty or unavailable', {
      root: WIKI_ROOT,
      path: wikiPath,
      error: error?.message || error
    })
  }
}

onMounted(() => loadWikiDirectory(WIKI_ROOT))
watch(() => store.activeVaultId, () => loadWikiDirectory(WIKI_ROOT))
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
</style>
