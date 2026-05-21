<template>
  <aside
    class="en-sidebar"
    :class="{ 'is-drop-target': isDragOver }"
    @dragover.prevent="isDragOver = true"
    @dragleave="isDragOver = false"
    @drop.prevent="attachDroppedEntry"
  >
    <div class="en-sidebar-scroll">
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
        />
      </div>

      <section class="en-recent-notes">
        <button
          class="en-recent-heading"
          type="button"
        >
          <span>Recently edited</span>
        </button>
        <button
          v-for="note in recentNotes"
          :key="note.path"
          class="en-recent-note"
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
      </section>
    </div>
  </aside>
</template>

<script setup>
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useVaultStore } from '../stores/vaultStore'
import { useEditorStore } from '@/store/editor'
import SidebarTreeEntry from './SidebarTreeEntry.vue'

const store = useVaultStore()
const editorStore = useEditorStore()
const { currentFile } = storeToRefs(editorStore)
const isDragOver = ref(false)

const sidebarEntries = computed(() => store.sidebarAttachedItems)
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

const loadDirectory = async (relativePath = '') => {
  if (!store.activeVault?.path) return []
  return window.elephantnote.listDirectory(relativePath)
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
  gap: 24px;
  padding: 24px 14px;
  overflow-y: auto;
}

.en-sidebar-main,
.en-recent-notes {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.en-sidebar-main {
  min-height: 0;
}

.en-recent-notes {
  margin-top: auto;
  border-top: 1px solid var(--en-border);
  padding-top: 12px;
}

.en-recent-heading,
.en-recent-note {
  width: 100%;
  min-height: 36px;
  border: 0;
  border-radius: 8px;
  padding: 0 10px;
  color: var(--en-muted);
  background: transparent;
  font: inherit;
  text-align: left;
}

.en-recent-heading {
  color: var(--en-text);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.en-recent-note {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.en-recent-note:hover {
  color: var(--en-text);
  background: var(--en-soft);
}

.en-recent-empty {
  margin: 0;
  padding: 0 10px;
  color: var(--en-muted);
  font-size: 13px;
}
</style>
