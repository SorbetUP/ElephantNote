<template>
  <aside class="en-sidebar">
    <div class="en-sidebar-scroll">
      <button
        class="en-all-notes"
        :class="{
          active: store.activeWorkspaceView === 'notes' && store.currentPath === '' && !store.openedNotePath,
          'is-drop-target': isRootDropTarget,
          'is-drop-disabled': isRootDropDisabled
        }"
        type="button"
        @dragover.prevent="handleRootDragOver"
        @dragleave="handleRootDragLeave"
        @drop.prevent="handleRootDrop"
        @click="store.openDirectory('')"
      >
        <Inbox class="en-all-notes-icon" />
        <span>All notes</span>
      </button>

      <div class="en-sidebar-create-actions">
        <button type="button" :disabled="creating" @click="createNote">
          <FilePlus2 />
          <span>New note</span>
        </button>
        <button type="button" :disabled="creating" @click="createFolder">
          <FolderPlus />
          <span>New folder</span>
        </button>
      </div>

      <p v-if="actionError" class="en-sidebar-action-error">{{ actionError }}</p>

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
          :open-directory="store.openDirectory"
          :open-note="store.openNote"
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
            @click="store.openNote(note)"
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
  FilePlus2,
  FolderPlus,
  Inbox,
  Search
} from '@lucide/vue'
import { useVaultStore } from '../../stores/vaultStore'
import { useEditorStore } from '@/store/editor'
import SidebarTreeEntry from './SidebarTreeEntry.vue'
import { elephantnoteClient } from '../../services/elephantnoteClient'
import {
  canDropEntryOnDirectory,
  parseDraggedEntry
} from '../../utils/entryDragDrop'

const emit = defineEmits(['search'])
const store = useVaultStore()
const editorStore = useEditorStore()
const { currentFile } = storeToRefs(editorStore)
const isRootDropTarget = ref(false)
const isRootDropDisabled = ref(false)
const isRecentCollapsed = ref(false)
const showAllRecent = ref(false)
const creating = ref(false)
const actionError = ref('')
const recentLimit = 5

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

const runCreateAction = async (action) => {
  if (creating.value) return
  creating.value = true
  actionError.value = ''
  try {
    await action()
  } catch (error) {
    actionError.value = error?.message || 'Unable to create this item.'
  } finally {
    creating.value = false
  }
}

const createNote = () => runCreateAction(() => store.createNote())
const createFolder = () => runCreateAction(() => store.createFolder())

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

.en-all-notes:hover {
  background: var(--en-soft-strong);
}

.en-all-notes.active {
  background: color-mix(in srgb, var(--en-primary, #7c3aed) 20%, var(--en-soft));
  color: var(--en-text);
}

.en-all-notes.is-drop-target {
  outline: 1px solid var(--en-primary);
  background: color-mix(in srgb, var(--en-primary) 16%, var(--en-soft));
}

.en-all-notes.is-drop-disabled {
  outline: 1px solid var(--en-danger);
}

.en-all-notes-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.en-sidebar-create-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  padding: 0 8px 10px;
}

.en-sidebar-create-actions button {
  min-width: 0;
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 8px;
  border: 1px solid var(--en-border);
  border-radius: 9px;
  color: var(--en-text);
  background: transparent;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.en-sidebar-create-actions button:hover {
  background: var(--en-soft);
}

.en-sidebar-create-actions button:disabled {
  opacity: 0.55;
  cursor: wait;
}

.en-sidebar-create-actions svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
}

.en-sidebar-action-error {
  margin: -2px 10px 8px;
  color: var(--en-danger, #ef4444);
  font-size: 11px;
  line-height: 1.35;
}

.en-tags-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 14px 8px;
}

.en-tags-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--en-muted);
}

.en-tags-search-btn {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  color: var(--en-muted);
  background: transparent;
  cursor: pointer;
}

.en-tags-search-btn:hover {
  color: var(--en-text);
  background: var(--en-soft);
}

.en-tags-search-icon {
  width: 14px;
  height: 14px;
}

.en-sidebar-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
  padding: 0 6px;
  flex: 1;
  overflow-y: auto;
}

.en-recent-notes {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: auto;
  border-top: 1px solid var(--en-border);
  padding: 10px 8px 8px;
}

.en-recent-heading,
.en-recent-note,
.en-recent-more {
  width: 100%;
  min-height: 32px;
  border: 0;
  border-radius: 6px;
  padding: 0 8px;
  color: var(--en-muted);
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.en-recent-heading {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 7px;
  color: var(--en-text);
  font-size: 12px;
  font-weight: 600;
}

.en-recent-heading svg {
  width: 14px;
  height: 14px;
  color: var(--en-muted);
}

.en-recent-chevron,
.en-recent-more-icon {
  transition: transform 0.16s ease;
}

.en-recent-chevron.collapsed {
  transform: rotate(-90deg);
}

.en-recent-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.en-recent-note {
  display: block;
  min-height: 30px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.en-recent-note:hover,
.en-recent-note.active {
  color: var(--en-text);
  background: var(--en-soft);
}

.en-recent-more {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--en-muted);
  font-size: 12px;
}

.en-recent-more-icon {
  width: 13px;
  height: 13px;
}

.en-recent-more-icon.expanded {
  transform: rotate(180deg);
}

.en-recent-empty {
  margin: 0;
  padding: 6px 8px;
  color: var(--en-muted);
  font-size: 12px;
}

@media (max-width: 760px), (pointer: coarse) {
  .en-sidebar-create-actions button {
    min-height: 46px;
    border-radius: 12px;
    font-size: 13px;
  }

  .en-all-notes {
    min-height: 46px;
  }
}
</style>
