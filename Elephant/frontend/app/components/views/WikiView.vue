<template>
  <section class="en-library en-wiki-library">
    <library-toolbar />
    <library-grid />
  </section>
</template>

<script setup>
import { onMounted, watch } from 'vue'
import log from '@/platform/runtimeLogShim'
import { useVaultStore } from '../../stores/vaultStore'
import LibraryToolbar from '../library/LibraryToolbar.vue'
import LibraryGrid from '../library/LibraryGrid.vue'

const store = useVaultStore()

const loadEmptyWiki = () => {
  store.currentPath = ''
  store.activeWorkspaceView = 'wiki'
  store.openedNotePath = ''
  store.entries = []
  log.info('[wiki] empty wiki view', {
    entries: 0,
    reason: 'wiki-pages-not-created-yet'
  })
}

onMounted(loadEmptyWiki)
watch(() => store.activeVaultId, loadEmptyWiki)
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
