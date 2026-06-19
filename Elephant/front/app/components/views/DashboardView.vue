<template>
  <section class="en-dashboard-shell">
    <header class="en-dashboard-hero">
      <p class="en-dashboard-kicker">Workspace dashboard</p>
      <h1>Opening a real dashboard note</h1>
      <p>
        This dashboard is persisted as <code>{{ dashboardPath }}</code> inside the vault, so it can
        be edited like any other note.
      </p>
    </header>

    <div class="en-dashboard-status">
      <span>{{ statusMessage }}</span>
      <button
        type="button"
        @click="openDashboardNote"
      >
        Open dashboard note
      </button>
    </div>

    <section class="en-dashboard-guide">
      <h2>What changed</h2>
      <ul>
        <li>The dashboard is no longer a local-only draft.</li>
        <li>It lives as a note under <code>.elephantnote</code>, hidden from the main note list.</li>
        <li>Once opened, the normal note editor handles editing and saving.</li>
      </ul>
    </section>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useVaultStore } from '../../stores/vaultStore'
import { DASHBOARD_NOTE_RELATIVE_PATH } from './dashboardNoteHelpers'

const store = useVaultStore()
const statusMessage = ref('Preparing dashboard note...')
const dashboardPath = computed(() => DASHBOARD_NOTE_RELATIVE_PATH)

const openDashboardNote = async () => {
  try {
    statusMessage.value = 'Opening dashboard note...'
    await store.ensureDashboardNote()
    statusMessage.value = 'Dashboard note opened.'
  } catch (error) {
    statusMessage.value = error instanceof Error ? error.message : 'Failed to open the dashboard note.'
  }
}

onMounted(() => {
  void openDashboardNote()
})
</script>

<style scoped>
.en-dashboard-shell {
  min-height: 0;
  flex: 1;
  display: grid;
  align-content: start;
  gap: 16px;
  padding: 32px 28px;
  overflow: auto;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--en-primary) 10%, transparent), transparent 34%),
    linear-gradient(180deg, color-mix(in srgb, var(--en-bg) 86%, black), var(--en-bg));
}

.en-dashboard-hero,
.en-dashboard-guide,
.en-dashboard-status {
  border: 1px solid var(--en-border);
  border-radius: 20px;
  background: color-mix(in srgb, var(--en-surface) 96%, transparent);
  box-shadow: 0 18px 42px color-mix(in srgb, #020617 8%, transparent);
}

.en-dashboard-hero {
  padding: 22px;
}

.en-dashboard-kicker {
  margin: 0 0 8px;
  color: var(--en-muted);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 11px;
}

.en-dashboard-hero h1 {
  margin: 0;
  font-size: clamp(28px, 4vw, 44px);
  line-height: 1.02;
}

.en-dashboard-hero p {
  margin: 12px 0 0;
  max-width: 60ch;
  color: var(--en-muted);
  line-height: 1.6;
}

.en-dashboard-hero code {
  padding: 0 6px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  color: var(--en-text);
  background: var(--en-bg);
}

.en-dashboard-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
}

.en-dashboard-status span {
  color: var(--en-muted);
}

.en-dashboard-status button {
  min-height: 38px;
  border: 1px solid var(--en-border);
  border-radius: 12px;
  padding: 0 14px;
  color: var(--en-text);
  background: var(--en-bg);
}

.en-dashboard-guide {
  padding: 18px 20px;
}

.en-dashboard-guide h2 {
  margin: 0 0 10px;
  font-size: 16px;
}

.en-dashboard-guide ul {
  margin: 0;
  padding-left: 18px;
  color: var(--en-muted);
}

.en-dashboard-guide li + li {
  margin-top: 8px;
}
</style>
