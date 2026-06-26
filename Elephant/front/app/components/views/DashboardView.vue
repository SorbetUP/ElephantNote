<template>
  <section class="en-dashboard-loader">
    <p>{{ statusMessage }}</p>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useVaultStore } from '../../stores/vaultStore'
import { elephantnoteClient } from '../../services/elephantnoteClient'
import {
  DASHBOARD_NOTE_RELATIVE_PATH,
  buildDashboardNoteCreatePayload
} from './dashboardNoteHelpers'

const store = useVaultStore()
const statusMessage = ref('Opening Dashboard.md...')

const findExistingDashboard = () => [
  ...(store.entries || []),
  ...(store.rootEntries || []),
  ...(store.openedNotes || [])
].find((entry) => entry?.path === DASHBOARD_NOTE_RELATIVE_PATH)

const normalizeDashboardNote = (result) => {
  const note = result?.note || result || {}
  return {
    ...note,
    path: note.path || DASHBOARD_NOTE_RELATIVE_PATH,
    fullPath: note.fullPath || (store.activeVault?.path ? `${store.activeVault.path}/${DASHBOARD_NOTE_RELATIVE_PATH}` : ''),
    title: note.title || 'Dashboard',
    kind: 'note',
    type: 'note',
    updatedAt: note.updatedAt || new Date().toISOString()
  }
}

const readExistingHiddenDashboard = async () => {
  try {
    const result = await elephantnoteClient.notes.read(DASHBOARD_NOTE_RELATIVE_PATH)
    return normalizeDashboardNote(result)
  } catch {
    return null
  }
}

const openDashboardNote = async () => {
  try {
    console.info('[dashboard] open hidden dashboard note:start', { path: DASHBOARD_NOTE_RELATIVE_PATH })
    statusMessage.value = 'Opening Dashboard.md...'

    let dashboardNote = findExistingDashboard() || await readExistingHiddenDashboard()
    if (!dashboardNote) {
      const result = await elephantnoteClient.notes.create(buildDashboardNoteCreatePayload())
      dashboardNote = normalizeDashboardNote(result)
    }

    store.openNote(dashboardNote, { record: false })
    statusMessage.value = 'Dashboard.md opened.'
    console.info('[dashboard] open hidden dashboard note:done', { path: dashboardNote.path })
  } catch (error) {
    statusMessage.value = error instanceof Error ? error.message : 'Failed to open Dashboard.md.'
    console.error('[dashboard] open hidden dashboard note:failed', error)
  }
}

onMounted(() => {
  void openDashboardNote()
})
</script>

<style scoped>
.en-dashboard-loader {
  min-height: 0;
  flex: 1;
  display: grid;
  place-items: center;
  padding: 24px;
  color: var(--en-muted);
  background: var(--en-bg);
}

.en-dashboard-loader p {
  margin: 0;
}
</style>
