<template>
  <div
    ref="hostRoot"
    class="en-rust-note-host"
    :class="{ 'en-rust-editor-active': rustEditorActive }"
    :data-editor-engine="rustEditorActive ? 'rust' : 'legacy-muya'"
  >
    <note-editor-host />

    <Teleport
      v-if="rustEditorActive"
      :to="editorTarget"
    >
      <MuyaRuntimeEditor
        v-model="editorMarkdown"
        mode="active"
        class="en-rust-note-editor"
        @ready="handleRustEditorReady"
      />
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useEditorStore } from '@/store/editor'
import { MuyaRuntimeEditor, isRustMuyaEngineAvailable } from '@/muya'
import NoteEditorHost from './NoteEditorHost.vue'
import { mergeEditorMarkdown, toEditorMarkdown } from '../../utils/noteDocument'

const editorStore = useEditorStore()
const hostRoot = ref(null)
const editorTarget = shallowRef(null)
let targetObserver = null

const activeFile = computed(() => editorStore.currentFile || null)
const fallbackTitle = computed(
  () => activeFile.value?.filename?.replace(/\.md$/i, '') || 'Untitled'
)

const editorMarkdown = computed({
  get: () => toEditorMarkdown(activeFile.value?.markdown || '', fallbackTitle.value),
  set: (value) => {
    const file = activeFile.value
    if (!file) return

    const nextDocument = mergeEditorMarkdown(
      file.markdown || '',
      String(value || ''),
      fallbackTitle.value
    )
    if (nextDocument === file.markdown) return

    file.markdown = nextDocument
    file.isSaved = false

    const index = editorStore.tabIdToIndex?.[file.id]
    if (index !== undefined && editorStore.tabs?.[index]) {
      editorStore.tabs[index].markdown = nextDocument
      editorStore.tabs[index].isSaved = false
    }
  }
})

const rustBridgeAvailable = computed(() => isRustMuyaEngineAvailable(window))
const rustEditorActive = computed(() => rustBridgeAvailable.value && !!editorTarget.value)

const resolveEditorTarget = () => {
  const target = hostRoot.value?.querySelector?.('.en-editor-host') || null
  if (!target) return false
  editorTarget.value = target
  target.dataset.editorEngine = rustBridgeAvailable.value ? 'rust' : 'legacy-muya'
  return true
}

const handleRustEditorReady = (runtime) => {
  if (!runtime?.engine) {
    throw new Error('Rust note editor mounted without the canonical Rust engine.')
  }

  window.__ELEPHANT_ACTIVE_EDITOR_ENGINE__ = 'rust'
  console.info('[elephantnote:editor] canonical Rust editor active', {
    engine: 'rust',
    notePath: activeFile.value?.pathname || '',
    revision: runtime.state?.revision || 0
  })
}

onMounted(async() => {
  await nextTick()
  if (resolveEditorTarget()) return

  targetObserver = new MutationObserver(() => {
    if (!resolveEditorTarget()) return
    targetObserver?.disconnect()
    targetObserver = null
  })
  targetObserver.observe(hostRoot.value, { childList: true, subtree: true })
})

onBeforeUnmount(() => {
  targetObserver?.disconnect()
  targetObserver = null
  if (window.__ELEPHANT_ACTIVE_EDITOR_ENGINE__ === 'rust') {
    delete window.__ELEPHANT_ACTIVE_EDITOR_ENGINE__
  }
})
</script>

<style>
.en-rust-note-host {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.en-rust-note-host > .en-editor-layer {
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.en-rust-note-host.en-rust-editor-active .en-editor-host {
  position: relative;
  min-height: 0;
}

.en-rust-note-host.en-rust-editor-active .en-editor-host > :not(.en-rust-note-editor) {
  display: none !important;
}

.en-rust-note-editor {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  background: var(--en-bg, var(--editorBgColor));
}

.en-rust-note-editor .muya-runtime-editor {
  box-sizing: border-box;
  width: 100%;
  min-height: 100%;
  padding: 28px var(--en-note-editor-gutter-right, 32px) 72px
    var(--en-note-editor-gutter-left, 40px);
  color: var(--en-text, inherit);
  caret-color: currentColor;
}
</style>
