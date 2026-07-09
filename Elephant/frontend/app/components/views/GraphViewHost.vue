<template>
  <div class="en-graph-host" :class="{ 'is-initializing': isInitializing }">
    <atomic-graph-view ref="graphView" />
  </div>
</template>

<script setup>
import { nextTick, onMounted, ref } from 'vue'
import AtomicGraphView from './AtomicGraphView.vue'

const graphView = ref(null)
const isInitializing = ref(true)

onMounted(async () => {
  await nextTick()
  const root = graphView.value?.$el
  const settingsPanel = root?.querySelector?.('.en-graph-settings-panel')

  if (settingsPanel) {
    // AtomicGraphView historically opens its option panel on construction.
    // Use its own toggle handler once so the initial state is closed without
    // bypassing or duplicating the component's state machine.
    root.querySelector?.('.en-graph-floating-icon.active')?.click()
  }

  isInitializing.value = false
})
</script>

<style scoped>
.en-graph-host {
  min-width: 0;
  min-height: 0;
  flex: 1;
  display: flex;
  overflow: hidden;
}

.en-graph-host :deep(.en-graph-premium) {
  min-width: 0;
  min-height: 0;
  flex: 1;
}

.en-graph-host.is-initializing :deep(.en-graph-settings-panel) {
  visibility: hidden;
}
</style>
