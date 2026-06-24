<template>
  <div class="en-editor-layer">
    <section
      class="en-editor-panel"
      :style="editorLayoutStyle"
    >
      <note-editor-top-bar
        :title="noteTitle"
        :note-date="noteDate"
        :tags="tags"
        :show-tag-hash="preferencesStore.showTagHashInEditor"
        :is-pinned="isPinned"
        :is-adding-tag="isAddingTag"
        :is-editing-tag="isEditingTag"
        :tag-draft="tagDraft"
        @update-title="updateTitle"
        @toggle-pin="togglePin"
        @close="closeOpenedNote"
        @start-tag-creation="startTagCreation"
        @edit-tag="beginEditTag"
        @delete-tag="deleteTag"
        @update-tag-draft="tagDraft = $event"
        @submit-tag="submitTag"
        @cancel-tag="cancelTag"
      />

      <div class="en-note-editor-shell">
        <div class="en-editor-host">
          <editor-with-tabs
            :markdown="visibleMarkdown"
            :cursor="cursor"
            :muya-index-cursor="muyaIndexCursor"
            :source-code="sourceCode"
            :show-tab-bar="false"
            :text-direction="textDirection"
            :platform="platform"
            :to-editor-markdown="documentToEditorMarkdown"
            :from-editor-markdown="editorToDocumentMarkdown"
          />
        </div>
      </div>

      <note-editor-footer
        v-if="showEditorFooter"
        :word-count="wordCount"
        :character-count="characterCount"
        :is-typography-open="isTypographyOpen"
        :theme-icon="themeIcon"
        @toggle-typography="isTypographyOpen = !isTypographyOpen"
        @set-text-scale="setTextScale"
        @toggle-theme="toggleTheme"
        @open-graph="openGraphView"
      />
    </section>

    <excalidraw-dialog
      v-if="isExcalidrawOpen"
      :title="excalidrawTitle"
      :file-name="excalidrawFileName"
      :theme="shellTheme"
      :initial-blob="excalidrawInitialBlob"
      :save-mode="excalidrawSaveMode"
      :insert-on-save="excalidrawInsertOnSave"
      @close="closeExcalidraw"
      @save="saveExcalidraw"
    />
  </div>
</template>

<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Moon,
  SunMedium
} from '@lucide/vue'
import { storeToRefs } from 'pinia'
import EditorWithTabs from '@/components/editorWithTabs'
import { useMainStore } from '@/store'
import { usePreferencesStore } from '@/store/preferences'
import { useEditorStore } from '@/store/editor'
import bus from '@/bus'
import { useVaultStore } from '../../stores/vaultStore'
import ExcalidrawDialog from './ExcalidrawDialog.vue'
import NoteEditorFooter from './NoteEditorFooter.vue'
import NoteEditorTopBar from './NoteEditorTopBar.vue'
import {
  getExcalidrawPreviewPath,
  getExcalidrawScenePath
} from '../../services/excalidraw'
import { elephantnoteClient } from '../../services/elephantnoteClient'
import { formatShortDate } from '../../services/markdownMetaService'
import {
  getEditorMarkdownStats,
  getDocumentCreatedAt,
  getDocumentTitle,
  mergeEditorMarkdown,
  renameDocumentTitle,
  toEditorMarkdown
} from '../../utils/noteDocument'
import {
  parseMarkdownTags,
  updateMarkdownTags
} from '../../utils/markdownTags'
import {
  getOppositeThemeVariant,
  getThemeMode
} from 'common/elephantnote/appearance'
import { useSearchStore } from '../../stores/searchStore'
import {
  resolveLocalImageSource,
  toMarkdownImageSource
} from '../../../../shared/imageSource.js'

const mainStore = useMainStore()
const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()
const store = useVaultStore()
const searchStore = useSearchStore()

const { platform } = storeToRefs(mainStore)
const { sourceCode, textDirection } = storeToRefs(preferencesStore)
const { currentFile } = storeToRefs(editorStore)

const AUTOSAVE_POLL_MS = 1000
const AUTOSAVE_DELAY_MS = 180
const HEAVY_NOTE_AUTOSAVE_DELAY_MS = 700
const HEAVY_NOTE_BYTES = 512 * 1024
const isAutosaveDebugEnabled = () => window.localStorage.getItem('elephantnote:debugAutosave') === 'true'
const autosaveDelayFor = (value, requestedDelay = AUTOSAVE_DELAY_MS) => {
  if (requestedDelay === 0) return 0
  const length = typeof value === 'string' ? value.length : 0
  return length >= HEAVY_NOTE_BYTES ? Math.max(requestedDelay, HEAVY_NOTE_AUTOSAVE_DELAY_MS) : requestedDelay
}
const logAutosave = (level, message, details) => {
  if (!isAutosaveDebugEnabled()) return
  console[level]?.(message, details)
}

const isAddingTag = ref(false)
const isEditingTag = ref(false)
const editingTagIndex = ref(-1)
const tagDraft = ref('')
const isTypographyOpen = ref(false)
const isExcalidrawOpen = ref(false)
const excalidrawInitialBlob = ref(null)
const excalidrawTargetPath = ref('')
const excalidrawScenePath = ref('')
const excalidrawInsertOnSave = ref(false)
const excalidrawFileName = ref('excalidraw.png')
const excalidrawTitle = ref('Excalidraw')
const excalidrawSaveMode = ref('png')
const textScale = ref(window.localStorage.getItem('elephantnote:editorTextScale') || 'normal')
const shellTheme = inject('elephantnoteTheme', ref(window.localStorage.getItem('elephantnote:theme') || 'light'))
const setShellTheme = inject('setElephantnoteTheme', (value) => {
  window.localStorage.setItem('elephantnote:theme', value)
})
let noteSaveTimer = null
let noteSaveInterval = null
let noteSaveInFlight = false
let pendingSaveAfterFlight = null
let lastSavedNotePath = ''
let lastSavedMarkdown = ''
let lastSeenNotePath = ''
let lastSeenMarkdown = ''

const openedNoteAbsolutePath = computed(() => {
  if (!store.activeVault?.path || !store.openedNotePath) return ''
  return window.path.join(store.activeVault.path, store.openedNotePath)
})
const getActiveNoteFile = () => {
  const pathname = openedNoteAbsolutePath.value
  if (!pathname) return currentFile.value
  if (currentFile.value?.pathname && window.fileUtils.isSamePathSync(currentFile.value.pathname, pathname)) {
    return currentFile.value
  }
  return editorStore.tabs.find((tab) => (
    tab?.pathname && window.fileUtils.isSamePathSync(tab.pathname, pathname)
  )) || null
}
const activeNoteFile = computed(() => getActiveNoteFile() || (openedNoteAbsolutePath.value ? null : currentFile.value))
const markdown = computed(() => activeNoteFile.value?.markdown || '')
const cursor = computed(() => activeNoteFile.value?.cursor || {})
const muyaIndexCursor = computed(() => activeNoteFile.value?.muyaIndexCursor || {})
const fallbackTitle = computed(() => activeNoteFile.value?.filename?.replace(/\.md$/i, '') || 'Untitled')
const documentToEditorMarkdown = (documentMarkdown) => toEditorMarkdown(documentMarkdown, fallbackTitle.value)
const editorToDocumentMarkdown = (editorMarkdown) =>
  mergeEditorMarkdown(markdown.value, editorMarkdown, fallbackTitle.value)
const visibleMarkdown = computed(() => documentToEditorMarkdown(markdown.value))
const documentMeta = computed(() => {
  const content = markdown.value || ''
  const createdAt = getDocumentCreatedAt(content)
  return {
    title: getDocumentTitle(content, fallbackTitle.value),
    tags: parseMarkdownTags(content),
    date: createdAt ? formatShortDate(createdAt) : formatShortDate(new Date())
  }
})
const noteTitle = computed(() => documentMeta.value.title)
const tags = computed(() => documentMeta.value.tags)
const noteDate = computed(() => documentMeta.value.date)
const editorMarkdownStats = computed(() => getEditorMarkdownStats(visibleMarkdown.value))
const wordCount = computed(() => editorMarkdownStats.value.word)
const characterCount = computed(() => editorMarkdownStats.value.character)
const showEditorFooter = computed(() => preferencesStore.showEditorFooter === true)
const editorMarginPx = computed(() => {
  const value = Number(preferencesStore.noteEditorMargin)
  if (!Number.isFinite(value)) return 24
  return Math.max(8, Math.min(160, Math.round(value)))
})
const editorLayoutStyle = computed(() => ({
  '--en-note-editor-gutter': `${editorMarginPx.value}px`,
  '--en-note-editor-gutter-left': `${Math.min(168, editorMarginPx.value + 8)}px`,
  '--en-note-editor-gutter-right': `${editorMarginPx.value}px`
}))
const themeIcon = computed(() => getThemeMode(shellTheme.value) === 'dark' ? SunMedium : Moon)
const currentNoteRelativePath = computed(() => {
  if (store.openedNotePath) return store.openedNotePath
  const pathname = currentFile.value?.pathname
  const vaultPath = store.activeVault?.path
  if (!pathname || !vaultPath) return ''
  const relativePath = window.path.relative(vaultPath, pathname)
  if (!relativePath || relativePath.startsWith('..') || window.path.isAbsolute(relativePath)) return ''
  return relativePath
})
const isPinned = computed(() => {
  const pathname = currentNoteRelativePath.value
  return !!pathname && store.pinnedNotePaths.includes(pathname)
})
const currentNoteDirectory = computed(() => {
  const pathname = currentFile.value?.pathname || openedNoteAbsolutePath.value
  if (pathname) return window.path.dirname(pathname)
  if (store.activeVault?.path) {
    return window.path.join(store.activeVault.path, store.currentPath || '')
  }
  return ''
})

const applyNoteMetadata = (entry, pathname, metadata = {}) => {
  if (!entry || entry.path !== pathname) return entry
  return {
    ...entry,
    title: metadata.title || entry.title,
    tags: Array.isArray(metadata.tags) ? metadata.tags : entry.tags,
    updatedAt: metadata.updatedAt || entry.updatedAt
  }
}

const syncVisibleNoteMetadata = (pathname, metadata = {}) => {
  if (!pathname || !Object.keys(metadata).length) return
  if (typeof store.updateNoteMetadata === 'function') {
    store.updateNoteMetadata(pathname, metadata)
  } else {
    store.entries = store.entries.map((entry) => applyNoteMetadata(entry, pathname, metadata))
    store.openedNotes = store.openedNotes.map((entry) => applyNoteMetadata(entry, pathname, metadata))
  }
  store.rootEntries = store.rootEntries.map((entry) => applyNoteMetadata(entry, pathname, metadata))
}

const getNoteParentPath = (relativePath = '') => {
  const parentPath = window.path.dirname(relativePath)
  return parentPath === '.' ? '' : parentPath
}

const markFileSavedIfCurrent = (file, notePath, savedMarkdown) => {
  if (!file || file.markdown !== savedMarkdown) return
  file.isSaved = true
  if (currentFile.value?.id === file.id && currentFile.value.markdown === savedMarkdown) {
    currentFile.value.isSaved = true
  }
  if (file.id) {
    window.electron?.ipcRenderer?.send?.('mt::tab-saved', file.id)
  }
  lastSavedNotePath = notePath
  lastSavedMarkdown = savedMarkdown
}

const refreshSavedEntries = async(notePath, result) => {
  const parentPath = getNoteParentPath(notePath)
  if (Array.isArray(result?.entries)) {
    if (parentPath === store.currentPath) {
      store.entries = result.entries
    }
    if (!parentPath) {
      store.rootEntries = result.entries
      return
    }
  }
  try {
    store.rootEntries = await elephantnoteClient.directory.list({ relativePath: '', limit: 121, includePreview: true })
    if (parentPath === store.currentPath) {
      store.entries = await elephantnoteClient.directory.list({ relativePath: store.currentPath, limit: 121, includePreview: true })
    }
  } catch (error) {
    console.warn('[elephantnote:save] unable to refresh entries after save', error)
  }
}

const persistNoteMarkdown = async(notePath, nextMarkdown, file = activeNoteFile.value || currentFile.value, reason = 'unknown') => {
  if (!store.activeVault?.path || !notePath || typeof nextMarkdown !== 'string') return false
  if (noteSaveInFlight) {
    pendingSaveAfterFlight = { notePath, nextMarkdown, file, reason }
    return false
  }
  noteSaveInFlight = true
  logAutosave('info', '[elephantnote:save] write:start', { notePath, length: nextMarkdown.length, reason })
  try {
    const result = await elephantnoteClient.notes.write({
      relativePath: notePath,
      markdown: nextMarkdown
    })
    await refreshSavedEntries(notePath, result)
    markFileSavedIfCurrent(file, notePath, nextMarkdown)
    logAutosave('info', '[elephantnote:save] write:done', { notePath, length: nextMarkdown.length, via: 'notes.write' })
    return true
  } catch (apiError) {
    console.warn('[elephantnote:save] notes.write failed; trying direct file write', { notePath, error: apiError?.message || String(apiError) })
    try {
      await window.fileUtils.writeFile(window.path.join(store.activeVault.path, notePath), nextMarkdown)
      await refreshSavedEntries(notePath, null)
      markFileSavedIfCurrent(file, notePath, nextMarkdown)
      logAutosave('info', '[elephantnote:save] write:done', { notePath, length: nextMarkdown.length, via: 'fileUtils.writeFile' })
      return true
    } catch (fileError) {
      console.error('[elephantnote:save] write:failed', { notePath, apiError, fileError })
      if (file?.id) {
        window.electron?.ipcRenderer?.send?.('mt::tab-save-failure', file.id, fileError?.message || apiError?.message || 'Unable to save note.')
      }
      return false
    }
  } finally {
    noteSaveInFlight = false
    const pending = pendingSaveAfterFlight
    pendingSaveAfterFlight = null
    if (pending && (pending.notePath !== lastSavedNotePath || pending.nextMarkdown !== lastSavedMarkdown)) {
      scheduleNoteSave(pending.notePath, pending.nextMarkdown, pending.file, 0, `${pending.reason}:after-flight`)
    }
  }
}

const scheduleNoteSave = (notePath, nextMarkdown, file = activeNoteFile.value || currentFile.value, delay = AUTOSAVE_DELAY_MS, reason = 'unknown') => {
  if (!notePath || typeof nextMarkdown !== 'string') return
  if (lastSavedNotePath === notePath && lastSavedMarkdown === nextMarkdown) return
  if (noteSaveTimer) window.clearTimeout(noteSaveTimer)
  const effectiveDelay = autosaveDelayFor(nextMarkdown, delay)
  logAutosave('info', '[elephantnote:save] schedule', { notePath, length: nextMarkdown.length, delay: effectiveDelay, reason })
  noteSaveTimer = window.setTimeout(() => {
    noteSaveTimer = null
    void persistNoteMarkdown(notePath, nextMarkdown, file, reason)
  }, effectiveDelay)
}

const rememberObservedMarkdown = (notePath, nextMarkdown, file, reason = 'observe') => {
  lastSeenNotePath = notePath
  lastSeenMarkdown = nextMarkdown
  if (file?.isSaved === false) {
    scheduleNoteSave(notePath, nextMarkdown, file, 0, `${reason}:first-unsaved`)
    return
  }
  lastSavedNotePath = notePath
  lastSavedMarkdown = nextMarkdown
}

const pollActiveMarkdownSave = (reason = 'poll') => {
  const file = getActiveNoteFile() || currentFile.value
  const notePath = currentNoteRelativePath.value || store.openedNotePath
  const nextMarkdown = file?.markdown
  if (!notePath || !file?.id || typeof nextMarkdown !== 'string') return
  if (lastSeenNotePath !== notePath) {
    rememberObservedMarkdown(notePath, nextMarkdown, file, reason)
    return
  }
  if (lastSeenMarkdown === nextMarkdown) return
  lastSeenMarkdown = nextMarkdown
  scheduleNoteSave(notePath, nextMarkdown, file, AUTOSAVE_DELAY_MS, reason)
}

const flushActiveNoteSave = async(reason = 'flush') => {
  if (noteSaveTimer) {
    window.clearTimeout(noteSaveTimer)
    noteSaveTimer = null
  }
  const file = getActiveNoteFile() || currentFile.value
  const notePath = currentNoteRelativePath.value || store.openedNotePath
  const nextMarkdown = file?.markdown
  if (!notePath || !file?.id || typeof nextMarkdown !== 'string') return false
  if (lastSavedNotePath === notePath && lastSavedMarkdown === nextMarkdown) return true
  return persistNoteMarkdown(notePath, nextMarkdown, file, reason)
}

const closeOpenedNote = async() => {
  await flushActiveNoteSave('close-note')
  store.closeNote()
}

const selectOpenedNoteTab = () => {
  const pathname = openedNoteAbsolutePath.value
  if (!pathname || !editorStore.tabs?.length) return
  if (currentFile.value?.pathname && window.fileUtils.isSamePathSync(currentFile.value.pathname, pathname)) return
  const hasTab = editorStore.tabs.some((tab) => tab.pathname && window.fileUtils.isSamePathSync(tab.pathname, pathname))
  if (hasTab) editorStore.SWITCH_TAB_BY_FILEPATH(pathname)
}

watch(openedNoteAbsolutePath, selectOpenedNoteTab, { immediate: true })
watch(() => editorStore.tabs.length, selectOpenedNoteTab)
watch(
  () => ({ notePath: currentNoteRelativePath.value || store.openedNotePath, markdown: markdown.value, file: activeNoteFile.value || currentFile.value }),
  ({ notePath, markdown: nextMarkdown, file }, previous) => {
    if (!notePath || !file?.id || typeof nextMarkdown !== 'string') return
    if (previous?.notePath !== notePath) {
      rememberObservedMarkdown(notePath, nextMarkdown, file, 'vue-watch')
      return
    }
    if (previous?.markdown === nextMarkdown) return
    lastSeenNotePath = notePath
    lastSeenMarkdown = nextMarkdown
    scheduleNoteSave(notePath, nextMarkdown, file, AUTOSAVE_DELAY_MS, 'vue-watch')
  }
)

const updateCurrentFileMarkdown = (nextMarkdown, metadata = {}) => {
  const file = activeNoteFile.value || currentFile.value
  if (!file) return
  file.markdown = nextMarkdown
  file.isSaved = false
  if (currentFile.value && file.id === currentFile.value.id) {
    currentFile.value.markdown = nextMarkdown
    currentFile.value.isSaved = false
  }
  const notePath = currentNoteRelativePath.value || store.openedNotePath
  if (notePath) {
    syncVisibleNoteMetadata(notePath, metadata)
    if (typeof searchStore.updateNoteIndex === 'function') {
      searchStore.updateNoteIndex(notePath, nextMarkdown, metadata)
    }
    lastSeenNotePath = notePath
    lastSeenMarkdown = nextMarkdown
    scheduleNoteSave(notePath, nextMarkdown, file, 0, 'toolbar-edit')
  }
}

const updateTitle = (nextTitle) => {
  const title = String(nextTitle || '').trim() || fallbackTitle.value
  updateCurrentFileMarkdown(renameDocumentTitle(markdown.value, title, fallbackTitle.value), { title })
}
const togglePin = () => {
  const pathname = currentNoteRelativePath.value
  if (!pathname) return
  const toggle = store.togglePin || store.togglePinnedNote || store.togglePinnedEntry
  if (typeof toggle === 'function') toggle.call(store, pathname)
}

const startTagCreation = () => {
  isAddingTag.value = true
  isEditingTag.value = false
  editingTagIndex.value = -1
  tagDraft.value = ''
}
const beginEditTag = (index) => {
  isEditingTag.value = true
  isAddingTag.value = false
  editingTagIndex.value = index
  tagDraft.value = tags.value[index] || ''
}
const cancelTag = () => {
  isAddingTag.value = false
  isEditingTag.value = false
  editingTagIndex.value = -1
  tagDraft.value = ''
}
const submitTag = () => {
  const tag = tagDraft.value.trim()
  if (!tag) {
    cancelTag()
    return
  }
  const nextTags = [...tags.value]
  if (isEditingTag.value && editingTagIndex.value >= 0) {
    nextTags[editingTagIndex.value] = tag
  } else if (!nextTags.includes(tag)) {
    nextTags.push(tag)
  }
  updateCurrentFileMarkdown(updateMarkdownTags(markdown.value, nextTags, noteTitle.value), { tags: nextTags })
  cancelTag()
}
const deleteTag = (index) => {
  const nextTags = tags.value.filter((_tag, currentIndex) => currentIndex !== index)
  updateCurrentFileMarkdown(updateMarkdownTags(markdown.value, nextTags, noteTitle.value), { tags: nextTags })
}
const setTextScale = (value) => {
  textScale.value = value
  window.localStorage.setItem('elephantnote:editorTextScale', value)
}
const toggleTheme = () => {
  const next = getOppositeThemeVariant(shellTheme.value)
  shellTheme.value = next
  setShellTheme(next)
}
const openGraphView = () => bus.emit('ELEPHANT::set-main-view', 'graph')

const readLocalBlob = async(pathname, type = '') => {
  const content = await window.fileUtils.readFile(pathname)
  if (content instanceof Blob) return content
  return new Blob([content], type ? { type } : undefined)
}

const openExcalidraw = async({ markdown, fileName, title, saveMode, insertOnSave }) => {
  const baseDir = currentNoteDirectory.value
  const targetName = fileName || `drawing-${Date.now()}.png`
  const targetPath = window.path.join(baseDir, targetName)
  const scenePath = getExcalidrawScenePath(targetPath)
  excalidrawTitle.value = title || 'Excalidraw'
  excalidrawFileName.value = targetName
  excalidrawSaveMode.value = saveMode || 'png'
  excalidrawInsertOnSave.value = !!insertOnSave
  excalidrawTargetPath.value = targetPath
  excalidrawScenePath.value = scenePath
  excalidrawInitialBlob.value = markdown instanceof Blob ? markdown : null
  isExcalidrawOpen.value = true
}

const openExcalidrawFromImage = async(src) => {
  try {
    const baseDir = currentNoteDirectory.value
    const imagePath = resolveLocalImageSource(src, baseDir)
    if (!imagePath) return
    const previewPath = window.path.extname(imagePath).toLowerCase() === '.excalidraw'
      ? getExcalidrawPreviewPath(imagePath)
      : imagePath
    const scenePath = getExcalidrawScenePath(previewPath)
    const initialBlob = window.fileUtils?.pathExistsSync?.(scenePath)
      ? await readLocalBlob(scenePath, 'application/vnd.excalidraw+json')
      : window.fileUtils?.pathExistsSync?.(previewPath)
        ? await readLocalBlob(previewPath)
        : null

    await openExcalidraw({
      markdown: initialBlob,
      fileName: window.path.basename(previewPath),
      title: 'Excalidraw',
      saveMode: 'png',
      insertOnSave: false
    })
  } catch (error) {
    console.error('[elephantnote:excalidraw] failed to open image-backed drawing', error)
  }
}

const closeExcalidraw = () => {
  isExcalidrawOpen.value = false
  excalidrawInitialBlob.value = null
}
const saveExcalidraw = async({ imageBlob, blob, sceneBlob, fileName } = {}) => {
  const writableImage = imageBlob || blob
  if (!writableImage) {
    console.error('[elephantnote:excalidraw] save failed: missing image payload')
    return
  }
  const resolvedName = fileName || excalidrawFileName.value
  const targetPath = window.path.join(currentNoteDirectory.value, resolvedName)
  const scenePath = getExcalidrawScenePath(targetPath)
  await window.fileUtils.ensureDir(window.path.dirname(targetPath))
  await window.fileUtils.writeFile(targetPath, writableImage)
  if (sceneBlob) await window.fileUtils.writeFile(scenePath, sceneBlob)
  excalidrawFileName.value = resolvedName
  excalidrawTargetPath.value = targetPath
  excalidrawScenePath.value = scenePath
  if (excalidrawInsertOnSave.value) {
    const source = toMarkdownImageSource(targetPath, currentNoteDirectory.value)
    const imageMarkdown = `![${resolvedName}](${source})`
    const nextMarkdown = [markdown.value.trimEnd(), imageMarkdown].filter(Boolean).join('\n\n')
    updateCurrentFileMarkdown(nextMarkdown)
  }
  closeExcalidraw()
}

onMounted(() => {
  bus.on('ELEPHANT::open-excalidraw', openExcalidraw)
  bus.on('open-excalidraw-from-image', openExcalidrawFromImage)
  pollActiveMarkdownSave('mount')
  noteSaveInterval = window.setInterval(() => pollActiveMarkdownSave('interval'), AUTOSAVE_POLL_MS)
})
onBeforeUnmount(() => {
  bus.off('ELEPHANT::open-excalidraw', openExcalidraw)
  bus.off('open-excalidraw-from-image', openExcalidrawFromImage)
  if (noteSaveInterval) {
    window.clearInterval(noteSaveInterval)
    noteSaveInterval = null
  }
  void flushActiveNoteSave('unmount')
})
</script>

<style scoped>
.en-editor-layer {
  height: 100%;
  display: flex;
  flex: 1;
  min-width: 0;
}
.en-editor-panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto 1fr auto;
  background: var(--editorBgColor);
  color: var(--editorColor);
}
.en-note-editor-shell {
  min-height: 0;
  overflow: hidden;
  padding: 0 var(--en-note-editor-gutter-right) 0 var(--en-note-editor-gutter-left);
}
.en-editor-host {
  height: 100%;
  min-width: 0;
}
</style>
