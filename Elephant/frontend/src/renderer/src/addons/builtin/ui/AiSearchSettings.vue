<template>
  <AiProviderSettingsPanel class="en-ai-search-only" initial-page="embedding" />
</template>

<script setup>
import AiProviderSettingsPanel from 'elephant-front/components/settings/AiProviderSettingsPanel.vue'
</script>

<style scoped>
.en-ai-search-only :deep(.en-ai-tabs button:not(:nth-child(3))) {
  display: none;
}
</style>
