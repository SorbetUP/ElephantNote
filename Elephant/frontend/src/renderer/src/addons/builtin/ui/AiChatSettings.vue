<template>
  <AiProviderSettingsPanel class="en-ai-chat-only" initial-page="chat" />
</template>

<script setup>
import AiProviderSettingsPanel from 'elephant-front/components/settings/AiProviderSettingsPanel.vue'
</script>

<style scoped>
.en-ai-chat-only :deep(.en-ai-tabs button:not(:nth-child(2))) {
  display: none;
}
</style>
