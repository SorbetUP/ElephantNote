<template>
  <div class="en-note-meta">
    <span>{{ noteDate }}</span>
    <note-tag-chip
      v-for="(tag, index) in tags"
      :key="`${tag}-${index}`"
      :tag="tag"
      @edit="$emit('edit-tag', index)"
      @delete="$emit('delete-tag', index)"
    />
    <button
      v-if="!isAddingTag"
      type="button"
      @click="$emit('start-tag-creation')"
    >
      + Add tag
    </button>
    <note-tag-form
      v-else
      :model-value="tagDraft"
      :is-editing="isEditingTag"
      @update:model-value="$emit('update:tagDraft', $event)"
      @submit="$emit('submit-tag')"
      @cancel="$emit('cancel-tag')"
    />
  </div>
</template>

<script setup>
import NoteTagChip from './NoteTagChip.vue'
import NoteTagForm from './NoteTagForm.vue'

defineProps({
  noteDate: {
    type: String,
    required: true
  },
  tags: {
    type: Array,
    default: () => []
  },
  isAddingTag: {
    type: Boolean,
    default: false
  },
  isEditingTag: {
    type: Boolean,
    default: false
  },
  tagDraft: {
    type: String,
    default: ''
  }
})

defineEmits([
  'start-tag-creation',
  'edit-tag',
  'delete-tag',
  'submit-tag',
  'cancel-tag',
  'update:tagDraft'
])
</script>

<style scoped>
.en-note-meta {
  min-height: 48px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 24px;
  border-bottom: 1px solid var(--en-border);
  color: var(--en-muted);
}

.en-note-meta > button {
  height: 30px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 0 10px;
  color: var(--en-text);
  background: transparent;
  font: inherit;
}
</style>
