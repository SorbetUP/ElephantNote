<template>
  <main
    class="en-main"
    :class="{ 'has-editor-open': hasOpenNote }"
  >
    <section
      v-if="!hasOpenNote && store.activeWorkspaceView === 'notes'"
      class="en-library"
    >
      <library-toolbar />
      <library-grid />
    </section>
    <dashboard-view v-else-if="!hasOpenNote && store.activeWorkspaceView === 'dashboard'" />
    <wiki-view v-else-if="!hasOpenNote && store.activeWorkspaceView === 'wiki'" />
    <chat-view v-else-if="!hasOpenNote && store.activeWorkspaceView === 'chat'" />
    <atomic-graph-view v-else-if="!hasOpenNote && store.activeWorkspaceView === 'graph'" />
    <models-view v-else-if="!hasOpenNote && store.activeWorkspaceView === 'models'" />
    <sigma-canvas v-else-if="!hasOpenNote && store.activeWorkspaceView === 'canvas'" />
    <calendar-view v-else-if="!hasOpenNote && store.activeWorkspaceView === 'calendar'" />
    <site-preview-panel v-if="!hasOpenNote && store.activeWorkspaceView === 'notes'" />
    <rust-note-editor-host
      v-if="hasOpenNote"
      class="en-main-editor"
    />
  </main>
</template>

<script setup>
import { computed } from 'vue'
import { useVaultStore } from '../../stores/vaultStore'
import LibraryToolbar from '../library/LibraryToolbar.vue'
import LibraryGrid from '../library/LibraryGrid.vue'
import RustNoteEditorHost from '../editor/RustNoteEditorHost.vue'
import SitePreviewPanel from '../../sitePreview/SitePreviewPanel.vue'
import DashboardView from '../views/DashboardView.vue'
import WikiView from '../views/WikiView.vue'
import ChatView from '../views/ChatView.vue'
import ModelsView from '../views/ModelsView.vue'
import SigmaCanvas from '../views/SigmaCanvas.vue'
import AtomicGraphView from '../views/AtomicGraphView.vue'
import CalendarView from '../views/CalendarView.vue'

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
