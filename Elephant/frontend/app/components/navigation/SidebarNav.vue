<template>
  <aside class="en-sidebar">
    <div class="en-sidebar-scroll">
      <button
        class="en-all-notes"
        :class="{
          active: !activeAddonViewId && store.activeWorkspaceView === 'notes' && store.currentPath === '' && !store.openedNotePath,
          'is-drop-target': isRootDropTarget,
          'is-drop-disabled': isRootDropDisabled
        }"
        type="button"
        @dragover.prevent="handleRootDragOver"
        @dragleave="handleRootDragLeave"
        @drop.prevent="handleRootDrop"
        @click="openAllNotes"
      >
        <Inbox class="en-all-notes-icon" />
        <span>All notes</span>
      </button>

      <section v-if="addonViews.length" class="en-addon-views">
        <p class="en-addon-views-label">Addons</p>
        <button
          v-for="entry in addonViews"
          :key="entry.contribution.id"
          class="en-addon-view-button"
          :class="{ active: activeAddonViewId === entry.contribution.id }"
          type="button"
          :title="entry.contribution.description || entry.contribution.title"
          @click="emit('open-addon-view', entry.contribution.id)"
        >
          <AddonIcon :name="entry.contribution.icon" />
          <span>{{ entry.contribution.title }}</span>
        </button>
      </section>

      <div class="en-tags-header">
        <span class="en-tags-label">Tags</span>
        <button
          class="en-tags-search-btn"
          type="button"
          title="Search tags"
          @click="emit('search')"
        >
          <Search class="en-tags-search-icon" />
        </button>
      </div>

      <div class="en-sidebar-main">
        <SidebarTreeEntry
          v-for="item in sidebarEntries"
          :key="item.id || item.path"
          :entry="item"
          :depth="0"
          :active-path="store.currentPath"
          :active-note-path="store.openedNotePath"
          :load-directory="loadDirectory"
          :open-directory="openDirectory"
          :open-note="openNote"
          :detach-entry="store.detachEntryFromSidebar"
        />
      </div>

      <section class="en-recent-notes">
        <button
          class="en-recent-heading"
          type="button"
          @click="isRecentCollapsed = !isRecentCollapsed"
        >
          <CalendarClock />
          <span>Recently edited</span>
          <ChevronDown
            class="en-recent-chevron"
            :class="{ collapsed: isRecentCollapsed }"
          />
        </button>
        <div
          v-if="!isRecentCollapsed"
          class="en-recent-list"
        >
          <button
            v-for="note in visibleRecentNotes"
            :key="note.path"
            class="en-recent-note"
            :class="{ active: note.path === store.openedNotePath }"
            type="button"
            @click="openNote(note)"
          >
            {{ note.title }}
          </button>
          <p
            v-if="!recentNotes.length"
            class="en-recent-empty"
          >
            No recent notes
          </p>
          <button
            v-if="recentNotes.length > recentLimit"
            class="en-recent-more"
            type="button"
            @click="showAllRecent = !showAllRecent"
          >
            <span>{{ showAllRecent ? 'Show less' : 'Show more' }}</span>
            <ChevronDown
              class="en-recent-more-icon"
              :class="{ expanded: showAllRecent }"
            />
          </button>
        </div>
      </section>
    </div>
  </aside>
</template>

<script setup>
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import {
  CalendarClock,
  ChevronDown,
  Inbox,
  Search
} from '@lucide/vue'
import { useVaultStore } from '../../stores/vaultStore'
import { useEditorStore } from '@/store/editor'
import { useAddonsStore } from '@/store/addons'
import AddonIcon from '../settings/AddonIcon.vue'
import SidebarTreeEntry from './SidebarTreeEntry.vue'
import { elephantnoteClient } from '../../services/elephantnoteClient'
import {
  canDropEntryOnDirectory,
  parseDraggedEntry
} from '../../utils/entryDragDrop'

const props = defineProps({
  activeAddonViewId: {
    type: String,
    default: ''
  }
})
const emit = defineEmits(['search', 'open-addon-view', 'close-addon-view'])
const store = useVaultStore()
const editorStore = useEditorStore()
const addonsStore = useAddonsStore()
const { currentFile } = storeToRefs(editorStore)
const isRootDropTarget = ref(false)
const isRootDropDisabled = ref(false)
const isRecentCollapsed = ref(false)
const showAllRecent = ref(false)
const recentLimit = 5

const activeAddonViewId = computed(() => props.activeAddonViewId)
const addonViews = computed(() => addonsStore.getContributions('views')
  .filter((entry) => entry?.contribution?.id && entry?.contribution?.title)
  .sort((left, right) => {
    const order = Number(left.contribution.order || 0) - Number(right.contribution.order || 0)
    return order || left.contribution.title.localeCompare(right.contribution.title)
  }))
const sidebarEntries = computed(() => store.rootSidebarEntries)
const recentNotes = computed(() => {
  const notes = [...store.recentNoteEntries]
  const file = currentFile.value
  if (file?.pathname && store.activeVault?.path && file.pathname.startsWith(store.activeVault.path)) {
    const relativePath = file.pathname.slice(store.activeVault.path.length + 1)
    if (!notes.some((note) => note.path === relativePath)) {
      notes.unshift({
        path: relativePath,
        title: file.filename?.replace(/\.md$/i, '') || 'Untitled',
        kind: 'note',
        type: 'note',
        updatedAt: new Date().toISOString()
      })
    }
  }
  return notes.slice(0, 8)
})
const visibleRecentNotes = computed(() => {
  return showAllRecent.value ? recentNotes.value : recentNotes.value.slice(0, recentLimit)
})

const loadDirectory = async (relativePath = '') => {
  if (!store.activeVault?.path) return []
  return elephantnoteClient.directory.list(relativePath)
}

const openAllNotes = async () => {
  emit('close-addon-view')
  await store.openDirectory('')
}

const openDirectory = async (...args) => {
  emit('close-addon-view')
  return store.openDirectory(...args)
}

const openNote = (...args) => {
  emit('close-addon-view')
  return store.openNote(...args)
}

const handleRootDragOver = (event) => {
  const entry = parseDraggedEntry(event)
  const canDrop = canDropEntryOnDirectory(entry, '')
  isRootDropTarget.value = canDrop
  isRootDropDisabled.value = !!entry && !canDrop
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = canDrop ? 'move' : 'none'
  }
}

const handleRootDragLeave = () => {
  isRootDropTarget.value = false
  isRootDropDisabled.value = false
}

const handleRootDrop = async (event) => {
  const entry = parseDraggedEntry(event)
  const canDrop = canDropEntryOnDirectory(entry, '')
  isRootDropTarget.value = false
  isRootDropDisabled.value = false
  if (!canDrop) return
  await store.moveEntry(entry, '')
}
</script>

<style scoped>
.en-sidebar {
  min-width: 0;
  border-right: 1px solid var(--en-border);
  background: var(--en-sidebar-bg, var(--en-bg));
  overflow: hidden;
}

.en-sidebar-scroll {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 8px 0 0;
  overflow-y: auto;
}

.en-all-notes {
  min-height: 38px;
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 8px 8px;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  color: var(--en-text);
  background: var(--en-soft);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.en-addon-view-button :deep(svg) { width: 16px; height: 16px; flex: 0 0 auto; }
</style>
