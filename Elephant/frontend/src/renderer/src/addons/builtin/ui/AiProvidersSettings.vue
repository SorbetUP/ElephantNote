<template>
  <AiProviderSettingsPanel class="en-ai-providers-only" initial-page="provider" />
</template>

<script setup>
import AiProviderSettingsPanel from 'elephant-front/components/settings/AiProviderSettingsPanel.vue'
</script>

<style scoped>
.en-ai-providers-only :deep(.en-ai-tabs button:not(:first-child)) {
  display: none;
}

/* Local model discovery belongs to the Open Models addon, not the provider base. */
.en-ai-providers-only :deep(.en-ai-card:first-of-type) {
  display: none;
}
</style>
