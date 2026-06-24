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

const openWikiRoot = async () => {
  if (!store.activeVault?.path) {
    store.entries = []
    return
  }

  const wikiRoot = normalizeWikiPath()
  store.currentPath = wikiRoot
  store.activeWorkspaceView = 'wiki'
  store.openedNotePath = ''

  try {
    await store.openDirectory(wikiRoot, {
      record: false,
      workspaceView: 'wiki'
    })
    log.info('[wiki] opened library root', {
      root: wikiRoot,
      entries: Array.isArray(store.entries) ? store.entries.length : 0
    })
  } catch (error) {
    store.entries = []
    store.currentPath = wikiRoot
    store.activeWorkspaceView = 'wiki'
    log.error('[wiki] unable to open library root', {
      root: wikiRoot,
      error: error?.message || error
    })
  }
}

onMounted(openWikiRoot)
watch(() => store.activeVaultId, openWikiRoot)
watch(
  () => store.activeWorkspaceView,
  (view) => {
    if (view === 'wiki' && !store.openedNotePath) {
      openWikiRoot()
    }
  }
)
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
