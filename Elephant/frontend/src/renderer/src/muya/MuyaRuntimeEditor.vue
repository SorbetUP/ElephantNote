<template>
  <div class="muya-runtime-shell" :data-muya-runtime-mode="mode">
    <div
      ref="rootRef"
      class="muya-runtime-editor"
      data-testid="muya-runtime-editor"
      @blur="handleHistoryBoundary"
      @compositionstart="handleCompositionStart"
      @compositionend="handleCompositionEnd"
      @input="handleInput"
      @keydown="handleKeydown"
      @paste="handlePaste"
      @pointerdown="handleHistoryBoundary"
    />
  </div>
</template>

<script setup>
import { computed, toRef, watch } from 'vue'

import { clipboardPayloadToMarkdown } from './clipboardRuntime.js'
import { handleMuyaKeydown } from './inputRulesRuntime.js'
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
let inputSyncTimer = null
let composing = false

const navigationKeys = new Set([
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'End',
  'Home',
  'PageDown',
  'PageUp'
])

const syncAndEmit = async() => {
  const next = await runtime.syncFromRuntime()
  emit('change', next)
  return next
}

const handleHistoryBoundary = () => {
  runtimeRef.value?.closeHistoryGroup?.()
}

const handleInput = () => {
  if (composing) return
  if (inputSyncTimer) clearTimeout(inputSyncTimer)
  inputSyncTimer = setTimeout(() => {
    inputSyncTimer = null
    void syncAndEmit()
  }, 0)
}

const handleCompositionStart = async() => {
  composing = true
  if (inputSyncTimer) {
    clearTimeout(inputSyncTimer)
    inputSyncTimer = null
  }
  await runtimeRef.value?.startComposition?.()
}

const handleCompositionEnd = async(event) => {
  try {
    if (runtimeRef.value?.commitComposition) {
      await runtimeRef.value.commitComposition(event.data || '')
    }
  } catch (error) {
    await runtimeRef.value?.cancelComposition?.()
    throw error
  } finally {
    composing = false
  }
  await syncAndEmit()
}

const handleKeydown = async(event) => {
  if (composing || event.isComposing) return
  if (navigationKeys.has(event.key)) handleHistoryBoundary()
  const handled = await handleMuyaKeydown(runtimeRef.value, event)
  if (handled) await syncAndEmit()
}

const handlePaste = async(event) => {
  if (!runtimeRef.value || composing) return
  const html = event.clipboardData?.getData('text/html') || ''
  const text = event.clipboardData?.getData('text/plain') || ''
  if (!html && !text) return
  event.preventDefault()
  const pastedMarkdown = clipboardPayloadToMarkdown({ html, text })
  if (runtimeRef.value.insertText) {
    await runtimeRef.value.insertText(pastedMarkdown)
  } else {
    runtimeRef.value.pasteClipboard({ html, text })
  }
  await syncAndEmit()
}

watch(ready, (value) => {
  if (value) emit('ready', runtimeRef.value)
}, { immediate: true })
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
