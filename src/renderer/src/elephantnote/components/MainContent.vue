<template>
  <main
    class="en-main"
    :class="{ 'has-editor-open': hasOpenNote }"
  >
    <section
      v-if="!hasOpenNote"
      class="en-library"
    >
      <library-toolbar />
      <library-grid />
    </section>
    <site-preview-panel v-if="!hasOpenNote" />
    <note-editor-host
      v-if="hasOpenNote"
      class="en-main-editor"
    />
  </main>
</template>

<script setup>
import { computed } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import LibraryToolbar from './LibraryToolbar.vue'
import LibraryGrid from './LibraryGrid.vue'
import NoteEditorHost from './NoteEditorHost.vue'
import SitePreviewPanel from '../sitePreview/SitePreviewPanel.vue'

const store = useVaultStore()
const hasOpenNote = computed(() => !!store.openedNotePath)
</script>

<style scoped>
.en-main {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--en-bg);
  overflow: hidden;
}

.en-library {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.en-main-editor {
  min-height: 0;
  flex: 1;
}
</style>
