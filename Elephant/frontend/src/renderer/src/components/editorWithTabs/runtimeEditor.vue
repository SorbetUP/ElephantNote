<template>
  <RustMuyaRuntimeEditor
    v-if="!sourceCode"
    :model-value="editorModelValue"
    :factory="rustRuntimeFactory"
    :on-file-drop="fileHandlers.dropped"
    :on-uri-drop="imageHandlers.uriDropped"
    :on-image-click="imageToolbar.open"
    mode="rust"
    class="rust-editor-runtime"
    @ready="handleRustRuntimeReady"
    @update:model-value="handleRustMarkdownChange"
  />
  <RuntimeTableDialog
    v-model="tableDialogVisible"
    @confirm="handleCreateTable"
  />
  <RuntimeImageToolbar
    :image="imageToolbar.state.active"
    @apply="imageToolbar.apply"
    @choose-file="imageToolbar.chooseFile"
    @delete="imageToolbar.remove"
    @close="imageToolbar.close"
  />
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'

import bus from '@/bus'
import { useEditorStore } from '@/store/editor'
import { getOptionsFromState } from '@/store/help'
import { usePreferencesStore } from '@/store/preferences'
import { useProjectStore } from '@/store/project'
import { checkpointBufferedState } from '@/store/bufferedState'
import { RustMuyaRuntimeEditor } from '@/muya'
import { createRustEditorRuntimeBinding } from '@/muya/editorRuntimeResource'
import {
  installEditorDurabilityAutomationFence,
  installNativeInputDurability
} from '@/muya/nativeInputDurability'
import { installEditorAutomationInputDefaults } from '@/platform/automationEditorInputDefaults'
import RuntimeImageToolbar from './runtimeImageToolbar.vue'
import RuntimeTableDialog from './runtimeTableDialog.vue'
import { rustBusCommand } from './runtimeEditorCommands'
import { createRuntimeImageHandlers } from './runtimeEditorImages'
import {
  createRuntimeFileHandlers,
  createRuntimeLinkHandler
} from './runtimeFileLinks'
import { useRuntimeImageToolbar } from './runtimeImageToolbarState'
import { applyRustEditorMarkdown } from './runtimeEditorState'

const props = defineProps({
  markdown: { type: String, required: true },
  cursor: { type: Object, required: true },
  sourceCode: { type: Boolean, required: true },
  textDirection: { type: String, required: true },
  platform: { type: String, required: true },
  toEditorMarkdown: { type: Function, default: (markdown) => markdown },
  fromEditorMarkdown: { type: Function, default: (markdown) => markdown },
  rustRuntimeFactory: { type: Function, default: null }
})

const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()
const projectStore = useProjectStore()
const { currentFile } = storeToRefs(editorStore)
const { projectTree } = storeToRefs(projectStore)
const sourceCode = computed(() => props.sourceCode)
const rustRuntime = ref(null)
const lastEditorMarkdown = ref(null)
const tableDialogVisible = ref(false)
let editorRuntimeBinding = null
let disposeEditorRuntimeResource = null
let disposeNativeInputDurability = () => {}
let disposeFileInteractions = () => {}

const editorModelValue = computed(() => {
  const converted = String(props.toEditorMarkdown(props.markdown) || '')
  const canonical = lastEditorMarkdown.value

  if (
    typeof canonical === 'string' &&
    String(props.fromEditorMarkdown(canonical) || '') === String(props.markdown || '')
  ) {
    return canonical
  }

  return converted
})

const persistEditorRecoveryCheckpoint = () => checkpointBufferedState().catch((error) => {
  console.error('[elephantnote:recovery] unable to persist editor checkpoint', error)
  return false
})

const unpublishEditorRuntime = () => {
  disposeEditorRuntimeResource?.()
  disposeEditorRuntimeResource = null
  editorRuntimeBinding?.dispose()
  editorRuntimeBinding = null
}

const publishEditorRuntime = () => {
  if (!editorRuntimeBinding || disposeEditorRuntimeResource) return
  const host = globalThis.__ELEPHANT_ADDON_HOST__
  if (typeof host?.provide === 'function') {
    disposeEditorRuntimeResource = host.provide('editor.runtime', editorRuntimeBinding.resource)
  }
}

const persistRecoveredFile = async(fileId) => {
  const file = currentFile.value
  if (!file?.id || file.id !== fileId || !file.pathname || file.isSaved !== false) return
  await checkpointBufferedState()
  const current = currentFile.value
  if (current?.id === fileId && current.pathname && current.isSaved === false) {
    console.warn('[elephantnote:recovery] persisting restored unsaved document', {
      fileId,
      pathname: current.pathname,
      markdownLength: String(current.markdown || '').length
    })
    editorStore.FILE_SAVE()
  }
}

const positionDropSelection = async (runtime, event) => {
  const container = runtime?.domContainer
  const ownerDocument = container?.ownerDocument
  if (!container || !ownerDocument) return false
  let range = ownerDocument.caretRangeFromPoint?.(event.clientX, event.clientY) || null
  if (!range) {
    const position = ownerDocument.caretPositionFromPoint?.(event.clientX, event.clientY)
    if (position?.offsetNode) {
      range = ownerDocument.createRange()
      range.setStart(position.offsetNode, position.offset)
      range.collapse(true)
    }
  }
  if (!range || !container.contains(range.startContainer)) return false

  const selection = ownerDocument.getSelection?.()
  selection?.removeAllRanges?.()
  selection?.addRange?.(range)
  await Promise.resolve()
  const logical = runtime.muya?.__selection?.()?.selection
  if (Number.isInteger(logical?.anchor) && Number.isInteger(logical?.focus)) {
    await runtime.muya?.__rustMirror?.setSelection?.(logical.anchor, logical.focus)
  }
  return true
}

const installFileInteractions = (runtime) => {
  const container = runtime?.domContainer
  if (!container?.addEventListener) return () => {}

  const drop = (event) => {
    const files = Array.from(event.dataTransfer?.files || [])
    if (!files.length) return
    event.preventDefault()
    event.stopImmediatePropagation()
    void (async () => {
      await positionDropSelection(runtime, event)
      await fileHandlers.dropped(files)
    })().catch((error) => console.error('[elephantnote:file-drop] failed', error))
  }
  const click = (event) => {
    if (!event.target?.closest?.('a[href]')) return
    void fileHandlers.openLink(event).catch((error) => {
      console.error('[elephantnote:file-open] failed', error)
    })
  }

  container.addEventListener('drop', drop, true)
  container.addEventListener('click', click, true)
  return () => {
    container.removeEventListener('drop', drop, true)
    container.removeEventListener('click', click, true)
  }
}

const handleRustRuntimeReady = (runtime) => {
  unpublishEditorRuntime()
  disposeNativeInputDurability()
  disposeFileInteractions()
  rustRuntime.value = runtime
  lastEditorMarkdown.value = String(runtime?.muya?.getMarkdown?.() ?? editorModelValue.value)
  disposeNativeInputDurability = installNativeInputDurability(runtime)
  disposeFileInteractions = installFileInteractions(runtime)
  editorRuntimeBinding = createRustEditorRuntimeBinding({
    runtime,
    getMarkdown: () => currentFile.value?.markdown ?? props.markdown
  })
  publishEditorRuntime()
  editorRuntimeBinding.notify({ reason: 'ready', engine: 'rust' })

  const fileId = currentFile.value?.id
  if (fileId && currentFile.value?.isSaved === false) {
    persistRecoveredFile(fileId).catch((error) => {
      console.error('[elephantnote:recovery] unable to persist restored document', error)
    })
  }
}

const dispatchRustBusCommand = (event, payload) => {
  if (props.sourceCode || !rustRuntime.value) return Promise.resolve(false)
  const command = rustBusCommand(event, payload)
  if (!command) return Promise.resolve(false)
  const result = rustRuntime.value.bridge.dispatch(command)
  result.catch((error) => console.error(`[Elephant Rust Editor] Failed to handle ${event}.`, error))
  return result
}

const imageHandlers = createRuntimeImageHandlers({
  currentFile,
  projectTree,
  preferencesStore,
  sourceCode,
  editorStore,
  dispatch: dispatchRustBusCommand
})
const fileHandlers = {
  ...createRuntimeFileHandlers({
    currentFile,
    projectTree,
    dispatch: dispatchRustBusCommand,
    dropImage: imageHandlers.dropped
  }),
  openLink: createRuntimeLinkHandler({ currentFile, projectTree })
}
const imageToolbar = useRuntimeImageToolbar(imageHandlers)

const handleParagraphCommand = (type) => {
  if (type === 'table' && !props.sourceCode) {
    tableDialogVisible.value = true
    return
  }
  return dispatchRustBusCommand('paragraph', type)
}

const handleCreateTable = (table) => dispatchRustBusCommand('createTable', table)
const busHandlers = Object.freeze({
  undo: () => dispatchRustBusCommand('undo'),
  redo: () => dispatchRustBusCommand('redo'),
  format: (type) => dispatchRustBusCommand('format', type),
  paragraph: handleParagraphCommand,
  duplicate: () => dispatchRustBusCommand('duplicate'),
  deleteParagraph: () => dispatchRustBusCommand('deleteParagraph'),
  insertParagraph: () => dispatchRustBusCommand('insertParagraph'),
  createParagraph: () => dispatchRustBusCommand('createParagraph'),
  'insert-horizontal-rule': () => dispatchRustBusCommand('insert-horizontal-rule'),
  'insert-image': imageHandlers.insert,
  'image-uploaded': imageHandlers.uploaded
})

const handleRustMarkdownChange = (editorMarkdown) => {
  const sourceEditorMarkdown = String(editorMarkdown || '')
  lastEditorMarkdown.value = sourceEditorMarkdown
  const file = currentFile.value
  const changed = applyRustEditorMarkdown({
    editorStore,
    file,
    editorMarkdown: sourceEditorMarkdown,
    fromEditorMarkdown: props.fromEditorMarkdown
  })

  if (changed) {
    const checkpoint = persistEditorRecoveryCheckpoint()
    if (file?.id && file.pathname) {
      checkpoint.finally(() => {
        if (file.isSaved === false) {
          editorStore.HANDLE_AUTO_SAVE({
            id: file.id,
            filename: file.filename,
            pathname: file.pathname,
            markdown: file.markdown,
            options: getOptionsFromState(file)
          })
        }
      })
    }
  }

  editorRuntimeBinding?.notify({
    reason: 'document-change',
    markdown: props.fromEditorMarkdown(sourceEditorMarkdown),
    editorMarkdown: sourceEditorMarkdown
  })
}

onMounted(() => {
  installEditorAutomationInputDefaults()
  installEditorDurabilityAutomationFence()
  for (const [event, handler] of Object.entries(busHandlers)) bus.on(event, handler)
  globalThis.addEventListener?.('elephantnote:addons-ready', publishEditorRuntime)
  publishEditorRuntime()
})

onBeforeUnmount(() => {
  for (const [event, handler] of Object.entries(busHandlers)) bus.off(event, handler)
  globalThis.removeEventListener?.('elephantnote:addons-ready', publishEditorRuntime)
  disposeNativeInputDurability()
  disposeNativeInputDurability = () => {}
  disposeFileInteractions()
  disposeFileInteractions = () => {}
  unpublishEditorRuntime()
  rustRuntime.value = null
  lastEditorMarkdown.value = null
  tableDialogVisible.value = false
  imageToolbar.close()
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
