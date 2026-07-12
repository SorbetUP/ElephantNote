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
      v-else-if="!hasOpenNote && showLibrary"
      class="en-library"
    >
      <library-toolbar />
      <library-grid />
    </section>
    <dashboard-view v-else-if="!hasOpenNote && store.activeWorkspaceView === 'dashboard'" />
    <sigma-canvas v-else-if="!hasOpenNote && store.activeWorkspaceView === 'canvas'" />
    <site-preview-panel v-if="sitesAddonEnabled && !hasOpenNote && !activeAddonViewId && store.activeWorkspaceView === 'notes'" />
    <note-editor-host
      v-if="hasOpenNote"
      class="en-main-editor"
    />
  </main>
</template>

<script setup>
import { computed } from 'vue'
import { useVaultStore } from '../../stores/vaultStore'
import { useAddonsStore } from '@/store/addons'
import LibraryToolbar from '../library/LibraryToolbar.vue'
import LibraryGrid from '../library/LibraryGrid.vue'
import NoteEditorHost from '../editor/NoteEditorHost.vue'
import SitePreviewPanel from '../../sitePreview/SitePreviewPanel.vue'
import DashboardView from '../views/DashboardView.vue'
import SigmaCanvas from '../views/SigmaCanvas.vue'
import AddonWorkspaceRouter from '../views/AddonWorkspaceRouter.vue'

const LEGACY_ADDON_WORKSPACES = new Set(['calendar', 'models', 'chat', 'wiki', 'graph'])
const props = defineProps({
  activeAddonViewId: {
    type: String,
    default: ''
  }
})
const emit = defineEmits(['close-addon-view'])
const store = useVaultStore()
const addonsStore = useAddonsStore()
const hasOpenNote = computed(() => !!store.openedNotePath)
const activeAddonViewId = computed(() => props.activeAddonViewId)
const showLibrary = computed(() => store.activeWorkspaceView === 'notes' || LEGACY_ADDON_WORKSPACES.has(store.activeWorkspaceView))
const sitesAddonEnabled = computed(() => addonsStore.items.some(
  (addon) => addon.manifest.id === 'elephant.sites' && addon.enabled
))
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
