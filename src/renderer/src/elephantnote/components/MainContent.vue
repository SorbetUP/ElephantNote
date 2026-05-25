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
    <graph-view v-else-if="!hasOpenNote && store.activeWorkspaceView === 'graph'" />
    <calendar-view v-else-if="!hasOpenNote && store.activeWorkspaceView === 'calendar'" />
    <site-preview-panel v-if="!hasOpenNote && store.activeWorkspaceView === 'notes'" />
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
import DashboardView from './DashboardView.vue'
import WikiView from './WikiView.vue'
import GraphView from './GraphView.vue'
import CalendarView from './CalendarView.vue'

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
