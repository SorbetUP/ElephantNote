<template>
  <RustMuyaRuntimeEditor
    v-if="rustRuntimeActive && !sourceCode"
    :model-value="toEditorMarkdown(markdown)"
    :factory="rustRuntimeFactory"
    mode="rust"
    class="rust-editor-runtime"
    @update:model-value="handleRustMarkdownChange"
  />
  <editor
    v-else
    :markdown="markdown"
    :cursor="cursor"
    :text-direction="textDirection"
    :platform="platform"
    :to-editor-markdown="toEditorMarkdown"
    :from-editor-markdown="fromEditorMarkdown"
  />
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'

import { useEditorStore } from '@/store/editor'
import { debouncedSendBufferedState } from '@/store/bufferedState'
import {
  RustMuyaRuntimeEditor,
  isMuyaRustRuntime,
  readMuyaRuntimeMode
} from '@/muya'
import Editor from './editor.vue'
import { applyRustEditorMarkdown } from './runtimeEditorState'

const props = defineProps({
  markdown: { type: String, required: true },
  cursor: { type: Object, required: true },
  sourceCode: { type: Boolean, required: true },
  textDirection: { type: String, required: true },
  platform: { type: String, required: true },
  toEditorMarkdown: {
    type: Function,
    default: (markdown) => markdown
  },
  fromEditorMarkdown: {
    type: Function,
    default: (markdown) => markdown
  },
  rustRuntimeFactory: {
    type: Function,
    default: null
  }
})

const editorStore = useEditorStore()
const { currentFile } = storeToRefs(editorStore)
const runtimeMode = ref(readMuyaRuntimeMode(window))
let runtimeModeTimer = null
let pendingRuntimeFrame = null

const syncRuntimeMode = () => {
  const next = window.__ELEPHANT_MUYA_RUNTIME__?.mode?.() || readMuyaRuntimeMode(window)
  if (runtimeMode.value !== next) runtimeMode.value = next
}

const scheduleRuntimeModeSync = () => {
  if (pendingRuntimeFrame) return
  pendingRuntimeFrame = window.requestAnimationFrame(() => {
    pendingRuntimeFrame = null
    syncRuntimeMode()
  })
}

const rustRuntimeActive = computed(() => isMuyaRustRuntime(runtimeMode.value))

const handleRustMarkdownChange = (editorMarkdown) => {
  applyRustEditorMarkdown({
    editorStore,
    file: currentFile.value,
    editorMarkdown,
    fromEditorMarkdown: props.fromEditorMarkdown,
    persist: debouncedSendBufferedState
  })
}

onMounted(() => {
  syncRuntimeMode()
  window.addEventListener('focus', scheduleRuntimeModeSync)
  window.addEventListener('visibilitychange', scheduleRuntimeModeSync)
  window.addEventListener('elephantnote:muya-runtime-mode-changed', scheduleRuntimeModeSync)
  runtimeModeTimer = window.setInterval(syncRuntimeMode, 2500)
})

onBeforeUnmount(() => {
  window.removeEventListener('focus', scheduleRuntimeModeSync)
  window.removeEventListener('visibilitychange', scheduleRuntimeModeSync)
  window.removeEventListener('elephantnote:muya-runtime-mode-changed', scheduleRuntimeModeSync)
  if (runtimeModeTimer) {
    window.clearInterval(runtimeModeTimer)
    runtimeModeTimer = null
  }
  if (pendingRuntimeFrame) {
    window.cancelAnimationFrame(pendingRuntimeFrame)
    pendingRuntimeFrame = null
  }
})
</script>

<style scoped>
.rust-editor-runtime {
  height: 100%;
  min-height: 0;
  overflow: auto;
  padding: 24px var(--en-note-editor-gutter-right, 24px) 80px
    var(--en-note-editor-gutter-left, 32px);
  background: var(--editorBgColor);
}
</style>
