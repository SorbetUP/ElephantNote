<template>
  <aside
    class="en-chat-sidebar"
    :style="{ width: `${store.chatSidebarWidth}px` }"
  >
    <div
      class="en-chat-sidebar-resizer"
      role="separator"
      aria-orientation="vertical"
      @pointerdown="startResize"
    />
    <ChatView class="en-chat-sidebar-body" />
  </aside>
</template>

<script setup>
import { onBeforeUnmount } from 'vue'
import ChatView from '../views/ChatView.vue'
import { useVaultStore } from '../../stores/vaultStore'

const store = useVaultStore()

const startResize = (event) => {
  const startX = event.clientX
  const startWidth = store.chatSidebarWidth
  event.currentTarget.setPointerCapture(event.pointerId)

  const onMove = (moveEvent) => {
    store.setChatSidebarWidth(startWidth - (moveEvent.clientX - startX))
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

onBeforeUnmount(() => {
  store.closeChatSidebar()
})
</script>

<style scoped>
.en-chat-sidebar {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: 1px minmax(0, 1fr);
  border-left: 1px solid var(--en-border);
  background: var(--en-bg);
  color: var(--en-text);
  overflow: hidden;
}

.en-chat-sidebar-resizer {
  width: 1px;
  cursor: col-resize;
  background: var(--en-border);
}

.en-chat-sidebar-body {
  grid-column: 2;
  min-height: 0;
  overflow: hidden;
}
</style>
