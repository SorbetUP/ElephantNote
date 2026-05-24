<template>
  <div
    class="en-library-grid"
    :class="{ list: store.viewMode === 'list' }"
  >
    <component
      :is="entry.kind === 'folder' ? FolderCard : NoteCard"
      v-for="(entry, index) in store.activeEntries"
      :key="entry.path"
      :entry="entry"
      :featured="entry.kind === 'note' && index === 0 && store.activeEntries.length > 3"
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
import { nextTick, ref } from 'vue'
import { useVaultStore } from '../stores/vaultStore'
import FolderCard from './FolderCard.vue'
import NoteCard from './NoteCard.vue'

const store = useVaultStore()
const renamingEntry = ref(null)
const renameEntryTitle = ref('')
const renameEntryInput = ref(null)

const openEntry = (entry) => {
  if (entry.kind === 'folder') {
    store.openDirectory(entry.path)
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
</script>

<style scoped>
.en-library-grid {
  min-height: 0;
  column-width: 360px;
  column-gap: 18px;
  padding: 0 28px 32px;
  overflow-y: auto;
}

.en-library-grid :deep(.en-card) {
  width: 100%;
  display: inline-flex;
  margin: 0 0 18px;
  break-inside: avoid;
}

.en-library-grid.list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  column-width: auto;
  column-gap: 0;
}

.en-library-grid.list :deep(.en-card) {
  display: flex;
  margin: 0;
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
