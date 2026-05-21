<template>
  <form
    class="en-inline-tag-form"
    @click.stop
    @submit.prevent="$emit('submit')"
  >
    <input
      :value="modelValue"
      autofocus
      type="text"
      :placeholder="isEditing ? 'Edit tag' : 'Tag'"
      @input="updateValue($event.target.value)"
      @keydown.esc="$emit('cancel')"
      @keydown.enter.prevent="$emit('submit')"
    >
    <button type="submit">
      Save
    </button>
    <button
      type="button"
      @click="$emit('cancel')"
    >
      Cancel
    </button>
  </form>
</template>

<script setup>
defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  isEditing: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'update:model-value', 'submit', 'cancel'])

const updateValue = (value) => {
  emit('update:modelValue', value)
  emit('update:model-value', value)
}
</script>

<style scoped>
.en-inline-tag-form {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.en-inline-tag-form input,
.en-inline-tag-form button {
  height: 30px;
  border: 1px solid var(--en-border);
  border-radius: 6px;
  color: var(--en-text);
  background: transparent;
  font: inherit;
}
</style>
