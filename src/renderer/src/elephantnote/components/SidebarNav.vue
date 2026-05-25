<template>
  <aside
    class="en-sidebar"
    :class="{ 'is-drop-target': isDragOver }"
    @dragover.prevent="isDragOver = true"
    @dragleave="isDragOver = false"
    @drop.prevent="attachDroppedEntry"
  >
    <div class="en-sidebar-scroll">
      <div class="en-sidebar-create">
        <button
          class="en-sidebar-create-button"
          type="button"
          title="New note"
          @click="createNote"
        >
          <FilePlus2 />
        </button>
        <button
          class="en-sidebar-create-button"
          type="button"
          title="New folder"
          @click="createFolder"
        >
          <FolderPlus />
        </button>
      </div>

      <button
        class="en-all-notes"
        :class="{ active: store.activeWorkspaceView === 'notes' && store.currentPath === '' && !store.openedNotePath }"
        type="button"
        @click="store.openDirectory('')"
      >
        <Files />
        <span>All notes</span>
      </button>

      <div class="en-sidebar-views">
        <button
          type="button"
          :class="{ active: store.activeWorkspaceView === 'dashboard' }"
          @click="store.setWorkspaceView('dashboard')"
        >
          <LayoutDashboard />
          <span>Dashboard</span>
        </button>
        <button
          type="button"
          :class="{ active: store.activeWorkspaceView === 'wiki' }"
          @click="store.setWorkspaceView('wiki')"
        >
          <BookOpenText />
          <span>Wiki</span>
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
  BookOpenText,
  CalendarClock,
  ChevronDown,
  FilePlus2,
  Files,
  FolderPlus,
  LayoutDashboard
} from '@lucide/vue'
import { useVaultStore } from '../stores/vaultStore'
import { useEditorStore } from '@/store/editor'
import SidebarTreeEntry from './SidebarTreeEntry.vue'
import { elephantnoteClient } from '../services/elephantnoteClient'

const store = useVaultStore()
const editorStore = useEditorStore()
const { currentFile } = storeToRefs(editorStore)
const isDragOver = ref(false)
const isRecentCollapsed = ref(false)
const showAllRecent = ref(false)
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

const attachDroppedEntry = async (event) => {
  isDragOver.value = false
  const raw = event.dataTransfer?.getData('application/x-elephantnote-entry')
  if (!raw) return
  try {
    await store.attachEntryToSidebar(JSON.parse(raw))
  } catch (err) {
    console.warn('Unable to attach dropped entry:', err)
  }
}

const createNote = async () => {
  await store.createNote()
}

const createFolder = async () => {
  await store.createFolder()
}
</script>

<style scoped>
.en-sidebar {
  min-width: 0;
  border-right: 1px solid var(--en-border);
  background: color-mix(in srgb, var(--en-bg) 92%, black);
  overflow: hidden;
}

.en-sidebar-scroll {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 8px 8px;
  overflow-y: auto;
}

.en-sidebar-create {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  padding: 0 6px;
}

.en-sidebar-create-button,
.en-all-notes,
.en-sidebar-views button {
  border: 0;
  border-radius: 8px;
  color: var(--en-muted);
  background: transparent;
}

.en-sidebar-create-button {
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.en-sidebar-create-button:hover,
.en-all-notes:hover,
.en-all-notes.active {
  color: var(--en-text);
  background: var(--en-soft);
}

.en-sidebar-create-button svg,
.en-all-notes svg,
.en-sidebar-views svg {
  width: 17px;
  height: 17px;
}

.en-all-notes,
.en-sidebar-views button {
  min-height: 36px;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  margin: 2px 6px 10px;
  padding: 0 10px;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  text-align: left;
}

.en-sidebar-views {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: -4px 6px 10px;
}

.en-sidebar-views button {
  width: 100%;
  margin: 0;
}

.en-sidebar-views button:hover,
.en-sidebar-views button.active {
  color: var(--en-text);
  background: var(--en-soft);
}

.en-sidebar-main,
.en-recent-notes {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.en-sidebar-main {
  min-height: 0;
  padding: 10px 6px 0;
  border-top: 1px solid color-mix(in srgb, var(--en-border) 78%, transparent);
}

.en-recent-notes {
  margin-top: auto;
  border: 1px solid color-mix(in srgb, var(--en-border-strong) 72%, transparent);
  border-radius: 12px;
  padding: 6px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--en-soft) 84%, transparent), color-mix(in srgb, var(--en-bg) 90%, transparent));
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 6%, transparent),
    0 16px 38px color-mix(in srgb, #020617 22%, transparent);
}

.en-recent-heading,
.en-recent-note,
.en-recent-more {
  width: 100%;
  min-height: 34px;
  border: 0;
  border-radius: 8px;
  padding: 0 9px;
  color: var(--en-muted);
  background: transparent;
  font: inherit;
  text-align: left;
}

.en-recent-heading {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 7px;
  color: var(--en-text);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0;
}

.en-recent-heading svg {
  width: 15px;
  height: 15px;
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
  gap: 2px;
  padding-top: 4px;
}

.en-recent-note {
  display: block;
  min-height: 34px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

.en-recent-note:hover,
.en-recent-note.active {
  color: var(--en-text);
  background: color-mix(in srgb, var(--en-soft-strong, var(--en-soft)) 72%, transparent);
}

.en-recent-more {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--en-muted);
  font-size: 12px;
}

.en-recent-more-icon {
  width: 14px;
  height: 14px;
}

.en-recent-more-icon.expanded {
  transform: rotate(180deg);
}

.en-recent-empty {
  margin: 0;
  padding: 8px 9px;
  color: var(--en-muted);
  font-size: 13px;
}
</style>
