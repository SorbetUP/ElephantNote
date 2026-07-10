<template>
  <div
    class="editor-with-tabs en-rust-editor-with-tabs"
    :data-editor-engine="rustActive ? 'rust' : 'legacy-muya'"
  >
    <div class="container">
      <MuyaRuntimeEditor
        v-if="rustActive"
        v-model="editorMarkdown"
        mode="active"
        class="en-rust-note-editor"
        :dir="textDirection || undefined"
        @ready="handleRustEditorReady"
      />
      <LegacyEditorWithTabs
        v-else
        v-bind="props"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, watchEffect } from 'vue'

import { useEditorStore } from '@/store/editor'
import { MuyaRuntimeEditor, isRustMuyaEngineAvailable } from '@/muya'

const LegacyEditorWithTabs = defineAsyncComponent(
  () => import('@/components/editorWithTabs/index.vue')
)

const props = defineProps({
  markdown: { type: String, required: true },
  cursor: { type: Object, required: true },
  muyaIndexCursor: { type: Object, default: () => ({}) },
  sourceCode: { type: Boolean, required: true },
  showTabBar: { type: Boolean, required: true },
  textDirection: { type: String, required: true },
  platform: { type: String, required: true },
  toEditorMarkdown: { type: Function, default: (markdown) => markdown },
  fromEditorMarkdown: { type: Function, default: (markdown) => markdown }
})

const editorStore = useEditorStore()
const rustBridgeAvailable = computed(() => isRustMuyaEngineAvailable(window))
const rustActive = computed(
  () => rustBridgeAvailable.value && props.sourceCode !== true && props.showTabBar !== true
)

const editorMarkdown = computed({
  get: () => String(props.markdown || ''),
  set: (value) => {
    const file = editorStore.currentFile
    if (!file) return
    const documentMarkdown = props.fromEditorMarkdown(String(value || ''))
    if (documentMarkdown === file.markdown) return

    file.markdown = documentMarkdown
    file.isSaved = false
    const index = editorStore.tabIdToIndex?.[file.id]
    if (index !== undefined && editorStore.tabs?.[index]) {
      editorStore.tabs[index].markdown = documentMarkdown
      editorStore.tabs[index].isSaved = false
    }
  }
})

watchEffect(() => {
  const pathname = editorStore.currentFile?.pathname || ''
  if (!pathname || typeof window.path?.dirname !== 'function') return
  window.DIRNAME = window.path.dirname(pathname)
})

const handleRustEditorReady = (runtime) => {
  if (!runtime?.engine) {
    throw new Error('Rust Muya editor mounted without the canonical Rust engine.')
  }
  window.__ELEPHANT_ACTIVE_EDITOR_ENGINE__ = 'rust'
  console.info('[elephantnote:editor] canonical Rust Muya surface active', {
    engine: 'rust',
    renderer: runtime.root?.dataset?.muyaRenderer || '',
    pathname: editorStore.currentFile?.pathname || '',
    revision: runtime.state?.revision || 0
  })
}

onBeforeUnmount(() => {
  if (window.__ELEPHANT_ACTIVE_EDITOR_ENGINE__ === 'rust') {
    delete window.__ELEPHANT_ACTIVE_EDITOR_ENGINE__
  }
})
</script>

<style scoped>
.editor-with-tabs {
  position: relative;
  height: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--editorBgColor);
}

.container,
.en-rust-note-editor {
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
  flex: 1;
  overflow: hidden;
}
</style>
