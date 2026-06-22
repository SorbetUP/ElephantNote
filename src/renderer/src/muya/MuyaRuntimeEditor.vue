<template>
  <div class="muya-runtime-shell" :data-muya-runtime-mode="mode">
    <div
      ref="rootRef"
      class="muya-runtime-editor"
      data-testid="muya-runtime-editor"
      @input="handleInput"
      @paste="handlePaste"
    />
  </div>
</template>

<script setup>
import { computed, toRef } from 'vue'

import { useMuyaRuntimeEditor } from './useMuyaRuntimeEditor.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  mode: { type: String, default: 'active' }
})

const emit = defineEmits(['update:modelValue', 'ready', 'change'])

const markdown = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const mode = toRef(props, 'mode')
const runtime = useMuyaRuntimeEditor({ markdown, mode })
const { rootRef, runtimeRef, ready } = runtime

const handleInput = () => {
  const next = runtime.syncFromRuntime()
  emit('change', next)
}

const handlePaste = (event) => {
  if (!runtimeRef.value) return
  const html = event.clipboardData?.getData('text/html') || ''
  const text = event.clipboardData?.getData('text/plain') || ''
  if (!html && !text) return
  event.preventDefault()
  runtimeRef.value.pasteClipboard({ html, text })
  const next = runtime.syncFromRuntime()
  emit('change', next)
}

const notifyReady = () => {
  if (ready.value) emit('ready', runtimeRef.value)
}

queueMicrotask(notifyReady)
</script>

<style scoped>
.muya-runtime-shell {
  width: 100%;
  height: 100%;
}

.muya-runtime-editor {
  min-height: 100%;
  outline: none;
  white-space: pre-wrap;
}
</style>
