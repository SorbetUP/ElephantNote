<template>
  <div class="editor-container">
    <div class="editor-middle elephantnote-middle">
      <div
        v-if="!init"
        class="editor-placeholder"
      />
      <app-shell
        v-if="init"
        :class="{ 'muya-runtime-underlay': muyaRuntimeActive }"
      />
      <MuyaRuntimeEditor
        v-if="init && muyaRuntimeEnabled"
        v-show="muyaRuntimeActive"
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

const isTauriRuntime = window.__MARKTEXT_RUNTIME__ && window.__MARKTEXT_RUNTIME__ !== 'electron'
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

const timer = ref(null)
const muyaRuntimeModeTimer = ref(null)
const muyaRuntimeMode = ref(window.__ELEPHANT_MUYA_RUNTIME__?.mode?.() || readMuyaRuntimeMode(window))

const { init } = storeToRefs(mainStore)
const { theme, customCss, zoom } = storeToRefs(preferencesStore)

const syncMuyaRuntimeMode = () => {
  muyaRuntimeMode.value = window.__ELEPHANT_MUYA_RUNTIME__?.mode?.() || readMuyaRuntimeMode(window)
}

const muyaRuntimeEnabled = computed(() => isMuyaRuntimeEnabled(muyaRuntimeMode.value))
const muyaRuntimeActive = computed(() => isMuyaRuntimeActive(muyaRuntimeMode.value))

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

const setupDragDropHandler = () => {
  window.addEventListener(
    'dragover',
    (e) => {
      if (!e.dataTransfer.types.length) return

      if (e.dataTransfer.types.indexOf('Files') >= 0) {
        if (
          e.dataTransfer.items.length === 1 &&
          e.dataTransfer.items[0].type.indexOf('image') > -1
        ) {
          // Do nothing
        } else {
          e.preventDefault()
          if (timer.value) {
            clearTimeout(timer.value)
          }
          timer.value = setTimeout(() => {
            bus.emit('importDialog', false)
          }, 300)
          bus.emit('importDialog', true)
        }
        e.dataTransfer.dropEffect = 'copy'
      } else {
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'none'
      }
    },
    false
  )
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
  muyaRuntimeModeTimer.value = setInterval(syncMuyaRuntimeMode, 500)

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
  if (muyaRuntimeModeTimer.value) clearInterval(muyaRuntimeModeTimer.value)
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
.muya-runtime-production-editor {
  position: absolute;
  inset: 0;
  z-index: 20;
  min-height: 100vh;
  padding: 48px 72px;
  overflow: auto;
  background: var(--editorBgColor);
  color: var(--editorColor);
}
</style>
