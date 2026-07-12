<template>
  <AiProviderSettingsPanel class="en-ai-ocr-only" initial-page="ocr" />
</template>

<script setup>
import AiProviderSettingsPanel from 'elephant-front/components/settings/AiProviderSettingsPanel.vue'
</script>

<style scoped>
.en-ai-ocr-only :deep(.en-ai-tabs button:not(:nth-child(4))) {
  display: none;
}
</style>
