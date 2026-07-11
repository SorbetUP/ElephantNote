<template>
  <main
    class="en-main"
    :class="{ 'has-editor-open': hasOpenNote }"
  >
    <addon-workspace-router
      v-if="!hasOpenNote && activeAddonViewId"
      :view-id="activeAddonViewId"
      @close="emit('close-addon-view')"
    />
    <section
      v-else-if="!hasOpenNote && store.activeWorkspaceView === 'notes'"
      class="en-library"
    >
      <library-toolbar />
      <library-grid />
    </section>
    <dashboard-view v-else-if="!hasOpenNote && store.activeWorkspaceView === 'dashboard'" />
    <wiki-view v-else-if="!hasOpenNote && store.activeWorkspaceView === 'wiki'" />
    <atomic-graph-view v-else-if="!hasOpenNote && store.activeWorkspaceView === 'graph'" />
    <sigma-canvas v-else-if="!hasOpenNote && store.activeWorkspaceView === 'canvas'" />
    <site-preview-panel v-if="!hasOpenNote && !activeAddonViewId && store.activeWorkspaceView === 'notes'" />
    <note-editor-host
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
import NoteEditorHost from '../editor/NoteEditorHost.vue'
import SitePreviewPanel from '../../sitePreview/SitePreviewPanel.vue'
import DashboardView from '../views/DashboardView.vue'
import WikiView from '../views/WikiView.vue'
import SigmaCanvas from '../views/SigmaCanvas.vue'
import AtomicGraphView from '../views/AtomicGraphView.vue'
import AddonWorkspaceRouter from '../views/AddonWorkspaceRouter.vue'

const props = defineProps({
  activeAddonViewId: {
    type: String,
    default: ''
  }
})
const emit = defineEmits(['close-addon-view'])
const store = useVaultStore()
const hasOpenNote = computed(() => !!store.openedNotePath)
const activeAddonViewId = computed(() => props.activeAddonViewId)
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
