<template>
  <section class="en-recent-notes">
    <button class="en-recent-heading" type="button" @click="isCollapsed = !isCollapsed">
      <CalendarClock aria-hidden="true" />
      <span>Recently edited</span>
      <ChevronDown class="en-recent-chevron" :class="{ collapsed: isCollapsed }" aria-hidden="true" />
    </button>
    <div v-if="!isCollapsed" class="en-recent-list">
      <button
        v-for="note in visibleRecentNotes"
        :key="note.path"
        class="en-recent-note"
        :class="{ active: note.path === vaultStore.openedNotePath }"
        type="button"
        @click="vaultStore.openNote(note)"
      >
        {{ note.title }}
      </button>
      <p v-if="!recentNotes.length" class="en-recent-empty">No recent notes</p>
      <button
        v-if="recentNotes.length > recentLimit"
        class="en-recent-more"
        type="button"
        @click="showAll = !showAll"
      >
        <span>{{ showAll ? 'Show less' : 'Show more' }}</span>
        <ChevronDown class="en-recent-more-icon" :class="{ expanded: showAll }" aria-hidden="true" />
      </button>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { CalendarClock, ChevronDown } from '@lucide/vue'
import { useVaultStore } from '../../stores/vaultStore'
import { useEditorStore } from '@/store/editor'

const vaultStore = useVaultStore()
const editorStore = useEditorStore()
const { currentFile } = storeToRefs(editorStore)
const isCollapsed = ref(false)
const showAll = ref(false)
const recentLimit = 5

const recentNotes = computed(() => {
  const notes = [...vaultStore.recentNoteEntries]
  const file = currentFile.value
  if (file?.pathname && vaultStore.activeVault?.path && file.pathname.startsWith(vaultStore.activeVault.path)) {
    const relativePath = file.pathname.slice(vaultStore.activeVault.path.length + 1)
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

const visibleRecentNotes = computed(() => showAll.value ? recentNotes.value : recentNotes.value.slice(0, recentLimit))
</script>

<style scoped>
.en-recent-notes { display: flex; flex-direction: column; gap: 6px; margin-top: auto; border-top: 1px solid var(--en-border); padding: 10px 8px 8px; }
.en-recent-heading, .en-recent-note, .en-recent-more { width: 100%; min-height: 32px; border: 0; border-radius: 6px; padding: 0 8px; color: var(--en-muted); background: transparent; font: inherit; text-align: left; cursor: pointer; }
.en-recent-heading { display: grid; grid-template-columns: 16px minmax(0, 1fr) 16px; align-items: center; gap: 7px; color: var(--en-text); font-size: 12px; font-weight: 600; }
.en-recent-heading svg { width: 14px; height: 14px; color: var(--en-muted); }
.en-recent-chevron, .en-recent-more-icon { transition: transform .16s ease; }
.en-recent-chevron.collapsed { transform: rotate(-90deg); }
.en-recent-list { display: flex; flex-direction: column; gap: 1px; }
.en-recent-note { display: block; min-height: 30px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.en-recent-note:hover, .en-recent-note.active { color: var(--en-text); background: var(--en-soft); }
.en-recent-more { display: inline-flex; align-items: center; gap: 4px; color: var(--en-muted); font-size: 12px; }
.en-recent-more-icon { width: 13px; height: 13px; }
.en-recent-more-icon.expanded { transform: rotate(180deg); }
.en-recent-empty { margin: 0; padding: 6px 8px; color: var(--en-muted); font-size: 12px; }
</style>
