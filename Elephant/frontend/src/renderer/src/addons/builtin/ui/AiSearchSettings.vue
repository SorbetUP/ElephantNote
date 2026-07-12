<template>
  <AiAddonSettings class="en-ai-search-only" initial-page="embedding" />
</template>

<script setup>
import AiAddonSettings from './AiAddonSettings.vue'
</script>

<style scoped>
.en-ai-search-only :deep(.en-ai-tabs button:not(:nth-child(3))) {
  display: none;
}
</style>
