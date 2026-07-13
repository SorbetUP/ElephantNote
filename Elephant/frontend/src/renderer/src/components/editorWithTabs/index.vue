<template>
  <div
    class="editor-with-tabs"
    :style="{ 'max-width': showSideBar ? `calc(100vw - ${sideBarWidth}px` : '100vw' }"
  >
    <tabs v-show="showTabBar" />
    <div class="container">
      <RustMuyaRuntimeEditor
        v-if="rustRuntimeActive && !sourceCode"
        :model-value="toEditorMarkdown(markdown)"
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
      <source-code
        v-if="sourceCode"
        :markdown="markdown"
        :muya-index-cursor="muyaIndexCursor"
        :text-direction="textDirection"
        :to-editor-markdown="toEditorMarkdown"
        :from-editor-markdown="fromEditorMarkdown"
      />
    </div>
    <tab-notifications />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useLayoutStore } from '@/store/layout'
import { useEditorStore } from '@/store/editor'
import { debouncedSendBufferedState } from '@/store/bufferedState'
import { storeToRefs } from 'pinia'
import {
  RustMuyaRuntimeEditor,
  isMuyaRustRuntime,
  readMuyaRuntimeMode
} from '@/muya'
import Tabs from './tabs.vue'
import Editor from './editor.vue'
import SourceCode from './sourceCode.vue'
import TabNotifications from './notifications.vue'

const props = defineProps({
  markdown: {
    type: String,
    required: true
  },
  cursor: {
    validator (value) {
      return typeof value === 'object'
    },
    required: true
  },
  muyaIndexCursor: {
    type: Object
  },
  sourceCode: {
    type: Boolean,
    required: true
  },
  showTabBar: {
    type: Boolean,
    required: true
  },
  textDirection: {
    type: String,
    required: true
  },
  platform: {
    type: String,
    required: true
  },
  toEditorMarkdown: {
    type: Function,
    default: (markdown) => markdown
  },
  fromEditorMarkdown: {
    type: Function,
    default: (markdown) => markdown
  }
})

const layoutStore = useLayoutStore()
const editorStore = useEditorStore()
const { showSideBar, sideBarWidth } = storeToRefs(layoutStore)
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
  const file = currentFile.value
  if (!file?.id) return
  const nextMarkdown = props.fromEditorMarkdown(String(editorMarkdown || ''))
  if (file.markdown === nextMarkdown) return

  file.markdown = nextMarkdown
  file.isSaved = false
  const index = editorStore.tabIdToIndex[file.id]
  if (index !== undefined && editorStore.tabs[index]) {
    editorStore.tabs[index].markdown = nextMarkdown
    editorStore.tabs[index].isSaved = false
  }
  debouncedSendBufferedState()
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
.editor-with-tabs {
  position: relative;
  height: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;

  overflow: hidden;
  background: var(--editorBgColor);
  & > .container {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
}

.rust-editor-runtime {
  height: 100%;
  min-height: 0;
  overflow: auto;
  padding: 24px var(--en-note-editor-gutter-right, 24px) 80px
    var(--en-note-editor-gutter-left, 32px);
  background: var(--editorBgColor);
}
</style>
