<template>
  <div class="en-ai-parent-settings">
    <nav class="en-ai-module-tabs" aria-label="AI settings">
      <button type="button" :class="{ active: activeTab === 'providers' }" @click="activeTab = 'providers'"><Server aria-hidden="true" /> Providers</button>
      <button v-if="moduleEnabled.chat" type="button" :class="{ active: activeTab === 'chat' }" @click="activeTab = 'chat'"><MessageCircle aria-hidden="true" /> Chat</button>
      <button v-if="moduleEnabled.search" type="button" :class="{ active: activeTab === 'search' }" @click="activeTab = 'search'"><Search aria-hidden="true" /> Search</button>
      <button v-if="moduleEnabled.ocr" type="button" :class="{ active: activeTab === 'ocr' }" @click="activeTab = 'ocr'"><ScanText aria-hidden="true" /> OCR</button>
    </nav>

    <AiProviderSettingsPanel v-if="activeTab === 'providers'" class="en-ai-providers-only" initial-page="provider" />
    <div v-else-if="activeTab === 'chat'" class="en-ai-submodule-slot" data-elephant-addon-settings-slot="ai.chat" />
    <div v-else-if="activeTab === 'search'" class="en-ai-submodule-slot" data-elephant-addon-settings-slot="ai.search" />
    <div v-else-if="activeTab === 'ocr'" class="en-ai-submodule-slot" data-elephant-addon-settings-slot="ai.ocr" />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { MessageCircle, ScanText, Search, Server } from '@lucide/vue'
import AiProviderSettingsPanel from 'elephant-front/components/settings/AiProviderSettingsPanel.vue'
import { useAddonsStore } from '@/store/addons'

const addonsStore = useAddonsStore()
const activeTab = ref('providers')
const moduleEnabled = computed(() => ({
  chat: Boolean(addonsStore.manager?.get?.('elephant.ai-chat')?.enabled),
  search: Boolean(addonsStore.manager?.get?.('elephant.ai-search')?.enabled),
  ocr: Boolean(addonsStore.manager?.get?.('elephant.ai-ocr')?.enabled)
}))

watch(moduleEnabled, (modules) => {
  if (activeTab.value !== 'providers' && !modules[activeTab.value]) activeTab.value = 'providers'
}, { deep: true })
</script>

<style scoped>
.en-ai-parent-settings { display: grid; gap: 14px; }
.en-ai-module-tabs { display: flex; align-items: center; gap: 4px; padding: 5px; overflow-x: auto; border: 1px solid var(--en-border, #c5cfdd); border-radius: 11px; background: var(--en-soft, #e9eff7); }
.en-ai-module-tabs button { min-height: 32px; display: inline-flex; align-items: center; gap: 6px; padding: 0 11px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--en-muted, #667085); font: inherit; font-size: 11px; white-space: nowrap; cursor: pointer; }
.en-ai-module-tabs button.active { border-color: var(--en-border, #c5cfdd); background: var(--en-surface, #fff); color: var(--en-text, #101828); box-shadow: 0 1px 4px rgba(2, 6, 23, .08); }
.en-ai-module-tabs svg { width: 14px; height: 14px; }
.en-ai-submodule-slot { min-height: 1px; }
/* AiProviderSettingsPanel predates the addon-owned parent navigation. Hide its legacy
   toolbar structurally from this host so only one tab strip can ever be visible. */
:global(.en-ai-providers-only .en-ai-toolbar) { display: none !important; }
/* Local model discovery belongs to the Open Models addon, not the provider base. */
:global(.en-ai-providers-only .en-ai-card:first-of-type) { display: none !important; }
</style>
