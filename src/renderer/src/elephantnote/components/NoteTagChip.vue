<template>
  <div class="en-note-tag">
    <button
      type="button"
      class="en-note-tag-label"
      :title="`Double-click to edit #${tag}`"
      :aria-label="`Edit tag ${tag}`"
      @dblclick="$emit('edit')"
    >
      #{{ tag }}
    </button>
    <button
      type="button"
      class="en-note-tag-icon"
      title="Edit tag"
      :aria-label="`Edit tag ${tag}`"
      @click="$emit('edit')"
    >
      <PencilLine class="en-icon en-icon-small" />
    </button>
    <button
      type="button"
      class="en-note-tag-icon danger"
      title="Delete tag"
      :aria-label="`Delete tag ${tag}`"
      @click="$emit('delete')"
    >
      <X class="en-icon en-icon-small" />
    </button>
  </div>
</template>

<script setup>
import { PencilLine, X } from '@lucide/vue'

defineProps({
  tag: {
    type: String,
    required: true
  }
})

defineEmits(['edit', 'delete'])
</script>

<style scoped>
.en-note-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.en-note-tag-label {
  height: 30px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 0 10px;
  color: var(--en-text);
  background: transparent;
  font: inherit;
}

.en-note-tag-icon {
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

.en-icon-small {
  width: 14px;
  height: 14px;
}
</style>
