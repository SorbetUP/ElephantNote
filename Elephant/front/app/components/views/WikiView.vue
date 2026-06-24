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
const store = useVaultStore()

const normalizeWikiPath = (relativePath = WIKI_ROOT) => {
  const normalized = String(relativePath || WIKI_ROOT)
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
  if (!normalized || normalized === WIKI_ROOT) return WIKI_ROOT
  return normalized.startsWith(`${WIKI_ROOT}/`) ? normalized : WIKI_ROOT
}

const loadWikiDirectory = async (relativePath = WIKI_ROOT) => {
  const wikiPath = normalizeWikiPath(relativePath)
  store.currentPath = wikiPath
  store.activeWorkspaceView = 'wiki'
  store.openedNotePath = ''

  if (!store.activeVault?.path) {
    store.entries = []
    return
  }

  try {
    const entries = await elephantnoteClient.directory.list(wikiPath)
    store.entries = Array.isArray(entries) ? entries : []
    store.currentPath = wikiPath
    store.activeWorkspaceView = 'wiki'
    log.info('[wiki] opened library directory', {
      root: WIKI_ROOT,
      path: wikiPath,
      entries: store.entries.length
    })
  } catch (error) {
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
