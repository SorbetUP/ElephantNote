<template>
  <AiAddonSettings class="en-ai-ocr-only" initial-page="ocr" />
</template>

<script setup>
import AiAddonSettings from './AiAddonSettings.vue'
</script>

<style scoped>
.en-ai-ocr-only :deep(.en-ai-tabs button:not(:nth-child(4))) {
  display: none;
}
</style>
