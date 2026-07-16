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
    <template v-if="!hasOpenNote && !activeAddonViewId && store.activeWorkspaceView === 'notes'">
      <template v-for="entry in workspacePanels" :key="entry.contribution.id">
        <component
          :is="entry.contribution.component"
          v-if="isPanelVisible(entry)"
        />
      </template>
    </template>
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
import AddonWorkspaceRouter from '../views/AddonWorkspaceRouter.vue'

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
const showLibrary = computed(() => store.activeWorkspaceView === 'notes')
const workspacePanels = computed(() => addonsStore.getContributions('layout.zones')
  .filter((entry) => entry?.contribution?.zone === 'workspace.notes' && entry?.contribution?.component)
  .sort((left, right) => Number(left.contribution.order || 0) - Number(right.contribution.order || 0)))

const isPanelVisible = (entry) => {
  const predicate = entry?.contribution?.when
  if (typeof predicate !== 'function') return true
  try {
    return predicate() === true
  } catch (error) {
    console.warn('[addons] workspace panel visibility predicate failed', {
      id: entry?.contribution?.id || '',
      error
    })
    return false
  }
}
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
