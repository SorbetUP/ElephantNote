<template>
  <section class="en-dashboard-loader">
    <p>{{ statusMessage }}</p>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useVaultStore } from '../../stores/vaultStore'
import { DASHBOARD_NOTE_RELATIVE_PATH } from './dashboardNoteHelpers'

const store = useVaultStore()
const statusMessage = ref('Opening Dashboard.md...')

const openDashboardNote = async () => {
  try {
    console.info('[dashboard] open normal note:start', { path: DASHBOARD_NOTE_RELATIVE_PATH })
    statusMessage.value = 'Opening Dashboard.md...'
    await store.ensureDashboardNote()
    statusMessage.value = 'Dashboard.md opened.'
    console.info('[dashboard] open normal note:done', { path: DASHBOARD_NOTE_RELATIVE_PATH })
  } catch (error) {
    statusMessage.value = error instanceof Error ? error.message : 'Failed to open Dashboard.md.'
    console.error('[dashboard] open normal note:failed', error)
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
