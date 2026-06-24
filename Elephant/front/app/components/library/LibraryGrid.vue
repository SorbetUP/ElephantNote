<template>
  <div
    class="en-library-grid"
    :class="{ list: store.viewMode === 'list', 'is-drop-target': isRootDropTarget }"
    @dragover.prevent="handleRootDragOver"
    @dragleave="handleRootDragLeave"
    @drop.prevent="handleRootDrop"
  >
    <NoteCard
      v-for="(entry, index) in visibleEntries"
      :key="entry.path"
      :entry="entry"
      :featured="index === 0 && visibleEntries.length > 3"
      @open="openEntry"
      @rename="renameEntry"
      @delete="deleteEntry"
    />
    <form
      v-if="renamingEntry"
      class="en-library-rename-form"
      @submit.prevent="submitRenameEntry"
    >
      <span>Rename</span>
      <input
        ref="renameEntryInput"
        v-model.trim="renameEntryTitle"
        type="text"
        aria-label="Entry name"
        @keydown.esc="cancelRenameEntry"
      >
      <button type="submit">
        Save
      </button>
      <button
        type="button"
        @click="cancelRenameEntry"
      >
        Cancel
      </button>
    </form>
  </div>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import { useVaultStore } from '../../stores/vaultStore'
import NoteCard from './NoteCard.vue'
import {
  canDropEntryOnDirectory,
  parseDraggedEntry
} from '../../utils/entryDragDrop'

const store = useVaultStore()
const renamingEntry = ref(null)
const renameEntryTitle = ref('')
const renameEntryInput = ref(null)
const isRootDropTarget = ref(false)

const isLegacyRootWikiEntry = (entry) => {
  const pathname = String(entry?.path || '').replace(/\\/g, '/').replace(/\/+$/g, '')
  return store.activeWorkspaceView === 'notes' && store.currentPath === '' && /^wiki$/i.test(pathname)
}

const visibleEntries = computed(() => store.activeEntries.filter((entry) => !isLegacyRootWikiEntry(entry)))

const openEntry = (entry) => {
  if (entry.kind === 'folder') {
    store.openDirectory(entry.path, { workspaceView: store.activeWorkspaceView })
  } else {
    store.openNote(entry)
  }
}

const renameEntry = async (entry) => {
  renamingEntry.value = entry
  renameEntryTitle.value = entry.title
  await nextTick()
  renameEntryInput.value?.focus()
  renameEntryInput.value?.select()
}

const cancelRenameEntry = () => {
  renamingEntry.value = null
  renameEntryTitle.value = ''
}

const submitRenameEntry = async () => {
  if (!renamingEntry.value) return
  const nextName = renameEntryTitle.value.trim()
  const entry = renamingEntry.value
  cancelRenameEntry()
  if (!nextName || nextName === entry.title) return
  await store.renameEntry(entry, nextName)
}

const deleteEntry = async (entry) => {
  if (!window.confirm(`Delete "${entry.title}"? This cannot be undone.`)) return
  await store.deleteEntry(entry)
}

const handleRootDragOver = (event) => {
  if (event.target?.closest?.('.en-card')) return
  const entry = parseDraggedEntry(event)
  isRootDropTarget.value = !!entry && canDropEntryOnDirectory(entry, store.currentPath)
}

const handleRootDragLeave = (event) => {
  if (event.currentTarget?.contains?.(event.relatedTarget)) return
  isRootDropTarget.value = false
}

const handleRootDrop = async (event) => {
  if (event.target?.closest?.('.en-card')) return
  const entry = parseDraggedEntry(event)
  isRootDropTarget.value = false
  if (!entry || !canDropEntryOnDirectory(entry, store.currentPath)) return
  await store.moveEntry(entry, store.currentPath)
}
</script>

<style scoped>
.en-library-grid {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(360px, 100%), 1fr));
  grid-auto-flow: row;
  align-content: start;
  gap: 22px;
  padding: 0 34px 40px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.en-library-grid::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.en-library-grid.is-drop-target {
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--en-primary) 9%, transparent),
      transparent 160px
    );
}

.en-library-grid :deep(.en-card) {
  width: 100%;
  min-width: 0;
  display: flex;
}

.en-library-grid.list {
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

.en-library-rename-form {
  position: fixed;
  left: 50%;
  top: 50%;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 12px;
  color: var(--en-text);
  background: var(--en-surface);
  transform: translate(-50%, -50%);
}
</style>
