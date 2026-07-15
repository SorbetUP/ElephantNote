<template>
  <div class="editor-container">
    <div class="editor-middle elephantnote-middle">
      <div
        v-if="!init"
        class="editor-placeholder"
      />
      <app-shell
        v-if="init"
        :class="{ 'muya-runtime-underlay': muyaRuntimeDocumentActive }"
        :aria-hidden="muyaRuntimeDocumentActive ? 'true' : undefined"
        :inert="muyaRuntimeDocumentActive || undefined"
      />
      <button
        v-if="muyaRuntimeDocumentActive"
        class="muya-runtime-close-note"
        type="button"
        aria-label="Close note"
        title="Close note"
        @click="closeMuyaRuntimeDocument"
      >
        <span aria-hidden="true">←</span>
        <span>All notes</span>
      </button>
      <MuyaRuntimeEditor
        v-if="init && muyaRuntimeEnabled && hasOpenDocument"
        v-show="muyaRuntimeDocumentActive"
        v-model="muyaRuntimeMarkdown"
        :mode="muyaRuntimeMode"
        class="muya-runtime-production-editor"
        @change="handleMuyaRuntimeChange"
      />
      <command-palette />
      <about-dialog />
      <export-setting-dialog />
      <rename />
      <tweet />
      <import-modal />
    </div>
  </div>
</template>

<script setup>
import { watch, nextTick, onMounted, onBeforeUnmount, ref, computed } from 'vue'
import { useMainStore } from '@/store'
import { storeToRefs } from 'pinia'
import { addStyles, addThemeStyle, addCustomStyle } from '@/util/theme'
import AboutDialog from '@/components/about'
import CommandPalette from '@/components/commandPalette'
import ExportSettingDialog from '@/components/exportSettings'
import Rename from '@/components/rename'
import Tweet from '@/components/tweet'
import ImportModal from '@/components/import'
import bus from '@/bus'
import { DEFAULT_STYLE } from '@/config'
import { useTweetStore } from '@/store/tweet'
import { useLayoutStore } from '@/store/layout'
import { useListenForMainStore } from '@/store/listenForMain'
import { usePreferencesStore } from '@/store/preferences'
import { useEditorStore } from '@/store/editor'
import { useCommandCenterStore } from '@/store/commandCenter'
import { useProjectStore } from '@/store/project'
import { useAutoUpdatesStore } from '@/store/autoUpdates'
import { useNotificationStore } from '@/store/notification'
import { debouncedSendBufferedState } from '@/store/bufferedState'
import { MuyaRuntimeEditor, isMuyaRuntimeActive, isMuyaRuntimeEnabled, readMuyaRuntimeMode } from '@/muya'
import AppShell from 'elephant-front/components/shell/AppShell.vue'

const isTauriRuntime = Boolean(window.__TAURI__ || window.__MARKTEXT_RUNTIME__)
const mainStore = useMainStore()
const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()
const layoutStore = useLayoutStore()
const projectStore = useProjectStore()
const tweetStore = useTweetStore()
const listenForMainStore = useListenForMainStore()
const autoUpdateStore = useAutoUpdatesStore()
const commandCenterStore = useCommandCenterStore()
const notificationStore = useNotificationStore()

let importDialogHideTimer = null
let dragOverHandler = null
let muyaRuntimeModeTimer = null
let pendingMuyaRuntimeFrame = null
const muyaRuntimeMode = ref(window.__ELEPHANT_MUYA_RUNTIME__?.mode?.() || readMuyaRuntimeMode(window))

const { init } = storeToRefs(mainStore)
const { theme, customCss, zoom } = storeToRefs(preferencesStore)

const syncMuyaRuntimeMode = () => {
  const nextMode = window.__ELEPHANT_MUYA_RUNTIME__?.mode?.() || readMuyaRuntimeMode(window)
  if (muyaRuntimeMode.value !== nextMode) {
    muyaRuntimeMode.value = nextMode
  }
}

const scheduleMuyaRuntimeModeSync = () => {
  if (pendingMuyaRuntimeFrame) return
  pendingMuyaRuntimeFrame = window.requestAnimationFrame(() => {
    pendingMuyaRuntimeFrame = null
    syncMuyaRuntimeMode()
  })
}

const muyaRuntimeEnabled = computed(() => isMuyaRuntimeEnabled(muyaRuntimeMode.value))
const muyaRuntimeActive = computed(() => isMuyaRuntimeActive(muyaRuntimeMode.value))
const hasOpenDocument = computed(() => Boolean(editorStore.currentFile?.id))
const muyaRuntimeDocumentActive = computed(() => muyaRuntimeActive.value && hasOpenDocument.value)

const muyaRuntimeMarkdown = computed({
  get: () => editorStore.currentFile?.markdown || '',
  set: (value) => {
    const file = editorStore.currentFile
    if (!file?.id) return
    file.markdown = value
    file.isSaved = false
    const index = editorStore.tabIdToIndex[file.id]
    if (index !== undefined && editorStore.tabs[index]) {
      editorStore.tabs[index].markdown = value
      editorStore.tabs[index].isSaved = false
    }
    debouncedSendBufferedState()
  }
})

const handleMuyaRuntimeChange = (value) => {
  muyaRuntimeMarkdown.value = value
}

const closeMuyaRuntimeDocument = () => {
  const file = editorStore.currentFile
  if (!file?.id) return
  editorStore.CLOSE_TAB(file)
}

watch(theme, (value, oldValue) => {
  if (value !== oldValue) {
    addThemeStyle(value)
  }
})

watch(customCss, (value, oldValue) => {
  if (value !== oldValue) {
    addCustomStyle({
      customCss: value
    })
  }
})

watch(zoom, (zoomValue) => {
  bus.emit('mt::window-zoom', zoomValue)
})

const hideImportDialogSoon = () => {
  if (importDialogHideTimer) {
    window.clearTimeout(importDialogHideTimer)
  }
  importDialogHideTimer = window.setTimeout(() => {
    importDialogHideTimer = null
    bus.emit('importDialog', false)
  }, 300)
}

const handleDragOver = (e) => {
  const dataTransfer = e.dataTransfer
  if (!dataTransfer?.types?.length) return

  if (dataTransfer.types.indexOf('Files') >= 0) {
    if (
      dataTransfer.items.length === 1 &&
      dataTransfer.items[0].type.indexOf('image') > -1
    ) {
      // Do nothing
    } else {
      e.preventDefault()
      hideImportDialogSoon()
      bus.emit('importDialog', true)
    }
    dataTransfer.dropEffect = 'copy'
  } else {
    e.stopPropagation()
    dataTransfer.dropEffect = 'none'
  }
}

const setupDragDropHandler = () => {
  if (dragOverHandler) return
  dragOverHandler = handleDragOver
  window.addEventListener('dragover', dragOverHandler, false)
}

const cleanupDragDropHandler = () => {
  if (dragOverHandler) {
    window.removeEventListener('dragover', dragOverHandler, false)
    dragOverHandler = null
  }
  if (importDialogHideTimer) {
    window.clearTimeout(importDialogHideTimer)
    importDialogHideTimer = null
  }
}

onMounted(async () => {
  if (global.marktext.initialState) {
    preferencesStore.SET_USER_PREFERENCE(global.marktext.initialState)
  }

  mainStore.LISTEN_WIN_STATUS()
  await commandCenterStore.LISTEN_COMMAND_CENTER_BUS()
  tweetStore.LISTEN_FOR_TWEET()
  layoutStore.LISTEN_FOR_LAYOUT()
  listenForMainStore.LISTEN_FOR_EDIT()
  preferencesStore.LISTEN_FOR_VIEW()
  listenForMainStore.LISTEN_FOR_SHOW_DIALOG()
  listenForMainStore.LISTEN_FOR_PARAGRAPH_INLINE_STYLE()
  projectStore.LISTEN_FOR_UPDATE_PROJECT()
  projectStore.LISTEN_FOR_LOAD_PROJECT()
  projectStore.LISTEN_FOR_SIDEBAR_CONTEXT_MENU()
  autoUpdateStore.LISTEN_FOR_UPDATE()
  preferencesStore.ASK_FOR_USER_PREFERENCE()
  preferencesStore.LISTEN_TOGGLE_VIEW()
  editorStore.LISTEN_SCREEN_SHOT()
  editorStore.LISTEN_FOR_CLOSE()
  editorStore.LISTEN_FOR_SAVE_AS()
  editorStore.LISTEN_FOR_MOVE_TO()
  editorStore.LISTEN_FOR_SAVE()
  editorStore.LISTEN_FOR_SET_PATHNAME()
  editorStore.LISTEN_FOR_BOOTSTRAP_WINDOW()
  editorStore.LISTEN_FOR_SAVE_CLOSE()
  editorStore.LISTEN_FOR_RENAME()
  editorStore.LINTEN_FOR_SET_LINE_ENDING()
  editorStore.LINTEN_FOR_SET_ENCODING()
  editorStore.LINTEN_FOR_SET_FINAL_NEWLINE()
  editorStore.LISTEN_FOR_NEW_TAB()
  editorStore.LISTEN_FOR_CLOSE_TAB()
  editorStore.LISTEN_FOR_TAB_CYCLE()
  editorStore.LISTEN_FOR_SWITCH_TABS()
  editorStore.LINTEN_FOR_PRINT_SERVICE_CLEARUP()
  editorStore.LINTEN_FOR_EXPORT_SUCCESS()
  editorStore.LISTEN_FOR_FILE_CHANGE()
  editorStore.LISTEN_FOR_RELOAD_IMAGES()
  editorStore.LISTEN_FOR_CONTEXT_MENU()
  editorStore.LISTEN_FOR_STATE_REPLACE()

  notificationStore.listenForNotification()

  setupDragDropHandler()
  window.addEventListener('focus', scheduleMuyaRuntimeModeSync)
  window.addEventListener('visibilitychange', scheduleMuyaRuntimeModeSync)
  window.addEventListener('elephantnote:muya-runtime-mode-changed', scheduleMuyaRuntimeModeSync)
  muyaRuntimeModeTimer = window.setInterval(syncMuyaRuntimeMode, 2500)

  if (isTauriRuntime) {
    setTimeout(() => {
      if (!mainStore.init) {
        mainStore.SET_INITIALIZED()
      }
    }, 250)
  }

  nextTick(() => {
    const style = global.marktext.initialState || DEFAULT_STYLE
    addStyles(style)
  })
})

onBeforeUnmount(() => {
  cleanupDragDropHandler()
  window.removeEventListener('focus', scheduleMuyaRuntimeModeSync)
  window.removeEventListener('visibilitychange', scheduleMuyaRuntimeModeSync)
  window.removeEventListener('elephantnote:muya-runtime-mode-changed', scheduleMuyaRuntimeModeSync)
  if (muyaRuntimeModeTimer) {
    window.clearInterval(muyaRuntimeModeTimer)
    muyaRuntimeModeTimer = null
  }
  if (pendingMuyaRuntimeFrame) {
    window.cancelAnimationFrame(pendingMuyaRuntimeFrame)
    pendingMuyaRuntimeFrame = null
  }
})
</script>

<style scoped>
.editor-placeholder,
.editor-container {
  display: flex;
  flex-direction: row;
  position: absolute;
  width: 100vw;
  height: 100vh;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}
.editor-container .hide {
  z-index: -1;
  opacity: 0;
  position: absolute;
  left: -10000px;
}
.editor-placeholder {
  background: var(--editorBgColor);
}
.editor-middle {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 100vh;
  position: relative;
  & > .editor {
    flex: 1;
  }
}
.muya-runtime-underlay {
  opacity: 0;
  pointer-events: none;
}
.muya-runtime-close-note {
  position: absolute;
  z-index: 22;
  top: 12px;
  left: 16px;
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 10px;
  border: 1px solid color-mix(in srgb, var(--editorColor, #222) 18%, transparent);
  border-radius: 8px;
  color: var(--editorColor, #222);
  background: color-mix(in srgb, var(--editorBgColor, #fff) 92%, transparent);
  box-shadow: 0 2px 10px rgb(0 0 0 / 8%);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  backdrop-filter: blur(8px);
}
.muya-runtime-close-note:hover,
.muya-runtime-close-note:focus-visible {
  background: var(--editorBgColor, #fff);
  outline: 2px solid color-mix(in srgb, var(--primaryColor, #6d5dfc) 42%, transparent);
  outline-offset: 1px;
}
.muya-runtime-production-editor {
  position: absolute;
  inset: 0;
  z-index: 20;
  min-height: 100vh;
  padding: 52px 72px 48px;
  overflow: auto;
  background: var(--editorBgColor);
}
@media (max-width: 760px), (hover: none) and (pointer: coarse) {
  .muya-runtime-close-note {
    top: calc(env(safe-area-inset-top, 0px) + 8px);
    left: 8px;
    min-height: 40px;
    padding-inline: 12px;
  }
  .muya-runtime-production-editor {
    padding: calc(env(safe-area-inset-top, 0px) + 58px) 18px calc(env(safe-area-inset-bottom, 0px) + 28px);
  }
}
</style>
