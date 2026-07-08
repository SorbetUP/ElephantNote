<template>
  <atomic-graph-view ref="graphView" />
</template>

<script setup>
import { nextTick, onMounted, ref } from 'vue'
import AtomicGraphView from './AtomicGraphView.vue'

const graphView = ref(null)

onMounted(async () => {
  await nextTick()
  const root = graphView.value?.$el
  const settingsPanel = root?.querySelector?.('.en-graph-settings-panel')
  if (!settingsPanel) return

  // AtomicGraphView historically opens its option panel on construction.
  // Use its own toggle handler once so the initial state is closed without
  // bypassing or duplicating the component's state machine.
  root.querySelector?.('.en-graph-floating-icon.active')?.click()
})
</script>
