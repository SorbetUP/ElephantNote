<template>
  <aside
    class="en-chat-sidebar"
    :style="{ width: `${store.chatSidebarWidth}px` }"
  >
    <header class="en-chat-sidebar-header">
      <div>
        <h2>Chat</h2>
        <p>Agentic answers grounded in the active vault.</p>
      </div>
      <div class="en-chat-sidebar-actions">
        <button
          type="button"
          @click="store.closeChatSidebar()"
        >
          Close
        </button>
      </div>
    </header>

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
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  display: grid;
  grid-template-columns: 1px minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  border-left: 1px solid var(--en-border);
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--en-primary) 10%, transparent), transparent 35%),
    color-mix(in srgb, var(--en-surface) 96%, transparent);
  box-shadow: -24px 0 80px color-mix(in srgb, #020617 26%, transparent);
  backdrop-filter: blur(20px);
}

.en-chat-sidebar-header {
  grid-column: 2;
  grid-row: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 18px 12px;
  border-bottom: 1px solid var(--en-border);
}

.en-chat-sidebar-header h2 {
  margin: 0;
  font-size: 18px;
}

.en-chat-sidebar-header p {
  margin: 4px 0 0;
  color: var(--en-muted);
  font-size: 12px;
}

.en-chat-sidebar-actions button {
  min-height: 34px;
  border: 1px solid var(--en-border);
  border-radius: 10px;
  padding: 0 12px;
  color: var(--en-text);
  background: var(--en-bg);
}

.en-chat-sidebar-resizer {
  grid-column: 1;
  grid-row: 1 / span 2;
  width: 1px;
  cursor: col-resize;
  background: var(--en-border);
}

.en-chat-sidebar-body {
  grid-column: 2;
  grid-row: 2;
  min-height: 0;
  overflow: hidden;
}

.en-chat-sidebar-body :deep(.en-chat-view) {
  height: 100%;
  padding: 10px 14px 14px;
}

.en-chat-sidebar-body :deep(.en-chat-header h1) {
  font-size: 20px;
}

.en-chat-sidebar-body :deep(.en-chat-message) {
  max-width: 100%;
}
</style>
