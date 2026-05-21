<template>
  <header class="en-note-header">
    <div class="en-note-title-row">
      <input
        class="en-note-title-input"
        type="text"
        :value="title"
        aria-label="Note title"
        @change="$emit('update-title', $event.target.value)"
      >
    </div>
    <div class="en-note-state">
      <button
        class="en-note-pin-button"
        type="button"
        :title="isPinned ? 'Unpin note' : 'Pin note'"
        :aria-label="isPinned ? 'Unpin note' : 'Pin note'"
        @click="$emit('toggle-pin')"
      >
        <component
          :is="pinIcon"
          class="en-icon"
        />
      </button>
      <button
        class="en-note-exit-zone"
        type="button"
        title="Close note"
        aria-label="Close note"
        @click="$emit('close')"
      >
        <X class="en-icon" />
      </button>
    </div>
  </header>
</template>

<script setup>
import { computed } from 'vue'
import { Pin, PinOff, X } from '@lucide/vue'

const props = defineProps({
  title: {
    type: String,
    required: true
  },
  isPinned: {
    type: Boolean,
    default: false
  }
})

defineEmits(['update-title', 'toggle-pin', 'close'])

const pinIcon = computed(() => (props.isPinned ? PinOff : Pin))
</script>

<style scoped>
.en-note-header {
  min-height: 74px;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 24px;
  border-bottom: 1px solid var(--en-border);
}

.en-note-title-row {
  min-width: 0;
  flex: 1;
}

.en-note-title-input {
  width: 100%;
  border: 0;
  color: var(--en-text);
  background: transparent;
  font: inherit;
  font-size: 28px;
  font-weight: 800;
  outline: none;
}

.en-note-state {
  display: flex;
  align-items: center;
  gap: 8px;
}

.en-note-pin-button,
.en-note-exit-zone {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 0;
  color: var(--en-text);
  background: transparent;
  font: inherit;
}

.en-note-pin-button:hover,
.en-note-exit-zone:hover {
  background: var(--en-soft);
}

.en-icon {
  width: 20px;
  height: 20px;
}
</style>
