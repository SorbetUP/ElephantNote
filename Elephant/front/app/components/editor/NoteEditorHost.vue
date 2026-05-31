<template>
  <div class="en-editor-layer">
    <section class="en-editor-panel">
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
        @close="store.closeNote"
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
import { getOptionsFromState } from '@/store/help'
import bus from '@/bus'
import { useVaultStore } from '../../stores/vaultStore'
import ExcalidrawDialog from './ExcalidrawDialog.vue'
import NoteEditorFooter from './NoteEditorFooter.vue'
import NoteEditorTopBar from './NoteEditorTopBar.vue'
import {
  findExcalidrawSceneForImage,
  getExcalidrawPreviewPath,
  getExcalidrawScenePath
} from '../../services/excalidraw'
import { formatShortDate } from '../../services/markdownMetaService'
import {
  ensureNoteDocument,
  getEditorMarkdownStats,
  getDocumentCreatedAt,
  getDocumentTitle,
  mergeEditorMarkdown,
  renameDocumentTitle,
  toEditorMarkdown
} from '../../utils/noteDocument'
import {
  deleteMarkdownTag,
  parseMarkdownTags,
  updateMarkdownTags
} from '../../utils/markdownTags'

const mainStore = useMainStore()
const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()
const store = useVaultStore()

const { platform } = storeToRefs(mainStore)
const { sourceCode, textDirection } = storeToRefs(preferencesStore)
const { currentFile } = storeToRefs(editorStore)

const isAddingTag = ref(false)
const isEditingTag = ref(false)
const editingTagIndex = ref(-1)
const tagDraft = ref('')
const isTypographyOpen = ref(false)
const isExcalidrawOpen = ref(false)
const excalidrawInitialBlob = ref(null)
const excalidrawTargetPath = ref('')
const excalidrawScenePath = ref('')
const excalidrawPreviewPath = ref('')
const excalidrawInsertOnSave = ref(false)
const excalidrawRefreshOnSave = ref(false)
const excalidrawFileName = ref('excalidraw.png')
const excalidrawTitle = ref('Excalidraw')
const excalidrawSaveMode = ref('png')
const textScale = ref(window.localStorage.getItem('elephantnote:editorTextScale') || 'normal')
const shellTheme = inject('elephantnoteTheme', ref(window.localStorage.getItem('elephantnote:theme') || 'light'))
const setShellTheme = inject('setElephantnoteTheme', (value) => {
  window.localStorage.setItem('elephantnote:theme', value)
})
const openedNoteAbsolutePath = computed(() => {
  if (!store.activeVault?.path || !store.openedNotePath) return ''
  return window.path.join(store.activeVault.path, store.openedNotePath)
})
const getActiveNoteFile = () => {
  const pathname = openedNoteAbsolutePath.value
  if (!pathname) return currentFile.value
  return editorStore.tabs.find((tab) => (
    tab?.pathname && window.fileUtils.isSamePathSync(tab.pathname, pathname)
  )) || null
}
const activeNoteFile = computed(() => getActiveNoteFile() || (openedNoteAbsolutePath.value ? null : currentFile.value))
const markdown = computed(() => activeNoteFile.value?.markdown || '')
const cursor = computed(() => activeNoteFile.value?.cursor)
const muyaIndexCursor = computed(() => activeNoteFile.value?.muyaIndexCursor)
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
const themeIcon = computed(() => shellTheme.value === 'dark' ? SunMedium : Moon)
const isPinned = computed(() => {
  const pathname = currentNoteRelativePath.value
  return !!pathname && store.pinnedNotePaths.includes(pathname)
})
const currentNoteRelativePath = computed(() => {
  if (store.openedNotePath) return store.openedNotePath
  const pathname = currentFile.value?.pathname
  const vaultPath = store.activeVault?.path
  if (!pathname || !vaultPath) return ''
  const relativePath = window.path.relative(vaultPath, pathname)
  if (!relativePath || relativePath.startsWith('..') || window.path.isAbsolute(relativePath)) return ''
  return relativePath
})
const currentNoteDirectory = computed(() => {
  const pathname = currentFile.value?.pathname || openedNoteAbsolutePath.value
  if (pathname) return window.path.dirname(pathname)
  if (store.activeVault?.path) {
    return window.path.join(store.activeVault.path, store.currentPath || '')
  }
  return ''
})

const selectOpenedNoteTab = () => {
  const pathname = openedNoteAbsolutePath.value
  if (!pathname || !editorStore.tabs?.length) return
  if (currentFile.value?.pathname && window.fileUtils.isSamePathSync(currentFile.value.pathname, pathname)) return
  const hasTab = editorStore.tabs.some((tab) => tab.pathname && window.fileUtils.isSamePathSync(tab.pathname, pathname))
  if (hasTab) editorStore.SWITCH_TAB_BY_FILEPATH(pathname)
}

const scheduleSave = () => {
  const file = getActiveNoteFile()
  if (!file?.id || !file.pathname) return
  editorStore.HANDLE_AUTO_SAVE({
    id: file.id,
    filename: file.filename,
    pathname: file.pathname,
    markdown: file.markdown,
    options: getOptionsFromState(file)
  })
}

const togglePin = () => {
  const pathname = currentNoteRelativePath.value
  if (!pathname) return
  store.togglePinnedNote(pathname)
}

const updateMarkdown = (nextMarkdown) => {
  const file = getActiveNoteFile()
  if (!file) return
  file.markdown = nextMarkdown
  file.isSaved = false
  if (file.id && file.id !== currentFile.value?.id) {
    editorStore.UPDATE_CURRENT_FILE(file)
  }
  store.updateNoteMetadata(currentNoteRelativePath.value, {
    title: getDocumentTitle(nextMarkdown, fallbackTitle.value),
    tags: parseMarkdownTags(nextMarkdown),
    updatedAt: new Date().toISOString()
  })
  scheduleSave()
}

const updateTitle = (value) => {
  const title = String(value || '').trim() || 'Untitled'
  updateMarkdown(renameDocumentTitle(markdown.value || '', title))
}

const addTag = () => {
  isAddingTag.value = true
  isEditingTag.value = false
  editingTagIndex.value = -1
  tagDraft.value = ''
}

const startTagCreation = () => {
  addTag()
}

const beginEditTag = (index) => {
  const tag = tags.value[index]
  if (!tag) return
  isAddingTag.value = true
  isEditingTag.value = true
  editingTagIndex.value = index
  tagDraft.value = tag
}

const cancelTag = () => {
  isAddingTag.value = false
  isEditingTag.value = false
  editingTagIndex.value = -1
  tagDraft.value = ''
}

const submitTag = (submittedValue = tagDraft.value) => {
  const nextTag = String(submittedValue || '').replace(/^#+/, '').trim()
  if (!nextTag) {
    cancelTag()
    return
  }

  const nextTags = [...tags.value]
  if (isEditingTag.value && editingTagIndex.value >= 0) {
    nextTags[editingTagIndex.value] = nextTag
  } else {
    nextTags.push(nextTag)
  }

  updateMarkdown(updateMarkdownTags(markdown.value || '', nextTags, noteTitle.value))
  cancelTag()
}

const deleteTag = (index) => {
  const tag = tags.value[index]
  if (!tag) return
  const nextMarkdown = deleteMarkdownTag(markdown.value || '', tag, noteTitle.value)
  updateMarkdown(nextMarkdown)
  if (isEditingTag.value && editingTagIndex.value === index) {
    cancelTag()
  }
}

const runFormat = (type) => {
  bus.emit('editor-focus')
  bus.emit('format', type)
}

const runParagraph = (type) => {
  bus.emit('editor-focus')
  bus.emit('paragraph', type)
}

const insertImage = async () => {
  const imagePath = await editorStore.ASK_FOR_IMAGE_PATH()
  if (imagePath) {
    bus.emit('editor-focus')
    bus.emit('insert-image', imagePath)
  }
}

const insertHorizontalRule = () => {
  bus.emit('editor-focus')
  bus.emit('paragraph', 'hr')
}

const runWritingCommand = (command) => {
  switch (command) {
    case 'heading-2':
      runParagraph('heading 2')
      break
    case 'bold':
      runFormat('strong')
      break
    case 'italic':
      runFormat('em')
      break
    case 'strike':
      runFormat('del')
      break
    case 'link':
      runFormat('link')
      break
    case 'bullets':
      runParagraph('ul-bullet')
      break
    case 'numbers':
      runParagraph('ol-order')
      break
    case 'tasks':
      runParagraph('ul-task')
      break
    case 'code':
      runFormat('inline_code')
      break
    case 'quote':
      runParagraph('blockquote')
      break
    case 'table':
      runParagraph('table')
      break
    case 'image':
      insertImage()
      break
    case 'excalidraw':
      openExcalidraw()
      break
    case 'horizontal-rule':
      insertHorizontalRule()
      break
    case 'speech-to-text':
      startSpeechToText()
      break
    case 'text-to-speech':
      speakNote()
      break
    default:
      console.warn(`Unknown writing command: ${command}`)
  }
}

const startSpeechToText = () => {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!Recognition) {
    window.electron.ipcRenderer.send('mt::show-notification', {
      title: 'Speech to text is not available in this runtime.',
      type: 'warning'
    })
    return
  }
  const recognition = new Recognition()
  recognition.lang = navigator.language || 'en-US'
  recognition.interimResults = false
  recognition.maxAlternatives = 1
  recognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript || ''
    if (!transcript) return
    const separator = markdown.value.trim() ? '\n\n' : ''
    updateMarkdown(`${markdown.value || ''}${separator}${transcript}`)
  }
  recognition.start()
}

const speakNote = () => {
  if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
    window.electron.ipcRenderer.send('mt::show-notification', {
      title: 'Text to speech is not available in this runtime.',
      type: 'warning'
    })
    return
  }
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(
    visibleMarkdown.value
      .replace(/^---[\s\S]*?---/, '')
      .replace(/[#*_`>\-[\]()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
  utterance.lang = navigator.language || 'en-US'
  window.speechSynthesis.speak(utterance)
}

const getMimeTypeFromPath = (pathname) => {
  const ext = String(window.path.extname(pathname || '')).toLowerCase()
  switch (ext) {
    case '.excalidraw':
      return 'application/vnd.excalidraw+json'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.svg':
      return 'image/svg+xml'
    default:
      return 'image/png'
  }
}

const blobFromFilePath = async (pathname) => {
  const data = await window.fileUtils.readFile(pathname)
  return new Blob([data], { type: getMimeTypeFromPath(pathname) })
}

const resolveLocalImagePath = (source) => {
  const value = String(source || '').trim()
  if (!value) return ''
  const withoutQuery = value.split(/[?#]/)[0]
  let decoded = withoutQuery
  try {
    decoded = decodeURI(withoutQuery)
  } catch {
    decoded = withoutQuery
  }

  if (decoded.startsWith('file://')) {
    return decoded
      .replace(/^file:\/\//, '')
      .replace(/^\/([A-Za-z]:\/)/, '$1')
  }

  if (window.path.isAbsolute(decoded)) return decoded
  return window.path.resolve(currentNoteDirectory.value || store.activeVault?.path || '', decoded)
}

const openExcalidrawFromPath = async (sourcePath = '', { insertOnSave = false, refreshOnSave = false } = {}) => {
  let selectedPath = sourcePath || ''
  const noteDirectory = currentNoteDirectory.value
  let initialBlob = null
  const extension = String(window.path.extname(selectedPath || '')).toLowerCase()
  const isSceneFile = extension === '.excalidraw'

  const scenePath = selectedPath
    ? (isSceneFile ? selectedPath : findExcalidrawSceneForImage(selectedPath) || getExcalidrawScenePath(selectedPath))
    : window.path.join(noteDirectory || '', `excalidraw-${Date.now()}.excalidraw`)

  const previewPath = getExcalidrawPreviewPath(scenePath)

  if (scenePath && window.fileUtils.pathExistsSync(scenePath)) {
    try {
      initialBlob = await blobFromFilePath(scenePath)
    } catch (error) {
      console.warn('Unable to load Excalidraw source:', error)
      selectedPath = ''
    }
  }

  excalidrawSaveMode.value = 'png'
  excalidrawInsertOnSave.value = insertOnSave
  excalidrawRefreshOnSave.value = refreshOnSave
  excalidrawScenePath.value = scenePath
  excalidrawPreviewPath.value = previewPath
  excalidrawTargetPath.value = previewPath
  excalidrawFileName.value = window.path.basename(scenePath)
  excalidrawTitle.value = selectedPath
    ? window.path.basename(selectedPath, window.path.extname(selectedPath))
    : noteTitle.value
  excalidrawInitialBlob.value = initialBlob
  isExcalidrawOpen.value = true
}

const openExcalidraw = async () => {
  bus.emit('editor-focus')
  await openExcalidrawFromPath('', { insertOnSave: true })
}

const openExcalidrawFromImage = async (imageSource) => {
  const imagePath = resolveLocalImagePath(imageSource)
  if (!imagePath) return

  const scenePath = findExcalidrawSceneForImage(imagePath)
  if (!scenePath) {
    window.electron.ipcRenderer.send('mt::show-notification', {
      title: 'No Excalidraw source file found for this image.',
      type: 'warning'
    })
    return
  }

  bus.emit('editor-focus')
  await openExcalidrawFromPath(scenePath, { insertOnSave: false, refreshOnSave: true })
}

const closeExcalidraw = () => {
  isExcalidrawOpen.value = false
  excalidrawInitialBlob.value = null
  excalidrawRefreshOnSave.value = false
}

const saveExcalidraw = async ({ blob, fileName, sceneBlob }) => {
  const targetPath = excalidrawPreviewPath.value || excalidrawTargetPath.value || window.path.join(currentNoteDirectory.value || '', fileName)
  const scenePath = excalidrawScenePath.value
  if (!targetPath || !scenePath || !blob || !sceneBlob) {
    closeExcalidraw()
    return
  }

  try {
    const pngBuffer = new Uint8Array(await blob.arrayBuffer())
    const sceneBuffer = new Uint8Array(await sceneBlob.arrayBuffer())

    // Always save both files:
    // - scenePath: editable Excalidraw source
    // - targetPath: PNG preview rendered inside the markdown note
    await window.fileUtils.writeFile(targetPath, pngBuffer)
    await window.fileUtils.writeFile(scenePath, sceneBuffer)

    if (excalidrawInsertOnSave.value) {
      bus.emit('editor-focus')
      bus.emit('insert-image', targetPath)
    } else if (excalidrawRefreshOnSave.value) {
      bus.emit('invalidate-image-cache')
    }

    closeExcalidraw()
  } catch (error) {
    console.error('Failed to save Excalidraw drawing:', error)
  }
}

const setTextScale = (value) => {
  textScale.value = value
  window.localStorage.setItem('elephantnote:editorTextScale', value)
  document.documentElement.style.setProperty(
    '--en-editor-text-scale',
    value === 'compact' ? '15px' : value === 'large' ? '18px' : '16px'
  )
  isTypographyOpen.value = false
}

const toggleTheme = () => {
  setShellTheme(shellTheme.value === 'dark' ? 'light' : 'dark')
}

const closeTransientMenus = (event) => {
  if (isTypographyOpen.value && !event?.target?.closest?.('.en-note-menu-wrap')) {
    isTypographyOpen.value = false
  }
  if (
    isAddingTag.value &&
    !event?.target?.closest?.('.en-inline-tag-form') &&
    !event?.target?.closest?.('.en-note-topbar')
  ) {
    cancelTag()
  }
}

setTextScale(textScale.value)

onMounted(() => {
  selectOpenedNoteTab()
  window.addEventListener('click', closeTransientMenus)
  bus.on('open-excalidraw-from-image', openExcalidrawFromImage)
  bus.on('elephantnote-writing-command', runWritingCommand)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', closeTransientMenus)
  bus.off('open-excalidraw-from-image', openExcalidrawFromImage)
  bus.off('elephantnote-writing-command', runWritingCommand)
})

watch(markdown, (content) => {
  if (!currentFile.value || !content || content.startsWith('---\n')) return
  updateMarkdown(ensureNoteDocument(content, noteTitle.value))
}, { flush: 'post' })

watch(openedNoteAbsolutePath, () => {
  selectOpenedNoteTab()
}, { flush: 'post' })

watch(showEditorFooter, (visible) => {
  if (!visible) isTypographyOpen.value = false
})

watch(
  () => editorStore.tabs.length,
  () => {
    selectOpenedNoteTab()
  },
  { flush: 'post' }
)

</script>

<style scoped>
.en-editor-layer {
  position: relative;
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  background: var(--en-bg);
  overflow: hidden;
}

.en-editor-panel {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  color: var(--en-text);
  background: var(--en-bg);
}

.en-note-header {
  min-height: 74px;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 24px;
  border-bottom: 1px solid var(--en-border);
}

.en-note-title-row {
  min-width: 0;
  flex: 1;
}

.en-note-title-input {
  width: 100%;
  border: 0;
  color: var(--en-text);
  background: transparent;
  font: inherit;
  font-size: 28px;
  font-weight: 800;
  outline: none;
}

.en-note-state,
.en-note-footer-actions,
.en-note-counts,
.en-note-meta {
  display: flex;
  align-items: center;
}

.en-note-state,
.en-note-footer-actions {
  gap: 8px;
}

.en-note-pin-button,
.en-note-exit-zone,
.en-note-footer-actions > button,
.en-note-menu-wrap > button,
.en-note-tag-icon,
.en-note-tag-label,
.en-note-meta > button {
  border: 1px solid var(--en-border);
  border-radius: 8px;
  color: var(--en-text);
  background: transparent;
  font: inherit;
}

.en-note-pin-button,
.en-note-exit-zone,
.en-note-footer-actions > button,
.en-note-menu-wrap > button,
.en-note-tag-icon {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.en-note-meta {
  min-height: 48px;
  gap: 8px;
  padding: 0 24px;
  border-bottom: 1px solid var(--en-border);
  color: var(--en-muted);
}

.en-note-meta > button,
.en-note-tag-label {
  height: 30px;
  padding: 0 10px;
}

.en-note-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.en-inline-tag-form {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.en-inline-tag-form input,
.en-inline-tag-form button {
  height: 30px;
  border: 1px solid var(--en-border);
  border-radius: 6px;
  color: var(--en-text);
  background: transparent;
  font: inherit;
}

.en-note-editor-shell {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--en-bg);
}

.en-note-pin-button:hover,
.en-note-exit-zone:hover,
.en-note-footer-actions button:hover {
  background: var(--en-soft);
}

.en-editor-host {
  min-height: 0;
  flex: 1;
  overflow: hidden;
  background: var(--en-bg);
  --editorBgColor: var(--en-bg);
  --editorColor: color-mix(in srgb, var(--en-text) 86%, transparent);
  --editorColor80: color-mix(in srgb, var(--en-text) 80%, transparent);
  --editorColor60: color-mix(in srgb, var(--en-text) 60%, transparent);
  --editorColor50: color-mix(in srgb, var(--en-text) 50%, transparent);
  --editorColor40: color-mix(in srgb, var(--en-text) 40%, transparent);
  --editorColor30: color-mix(in srgb, var(--en-text) 30%, transparent);
  --editorColor10: color-mix(in srgb, var(--en-text) 12%, transparent);
  --editorColor04: color-mix(in srgb, var(--en-text) 5%, transparent);
  --floatBgColor: var(--en-surface);
  --floatHoverColor: var(--en-soft);
  --floatBorderColor: var(--en-border);
  --iconColor: var(--en-muted);
  --codeBlockBgColor: var(--en-surface);
}

.en-note-footer {
  min-height: 50px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 24px;
  border-top: 1px solid var(--en-border);
  color: var(--en-muted);
}

.en-note-counts {
  gap: 12px;
}

.en-note-menu-wrap {
  position: relative;
}

.en-note-popover {
  position: absolute;
  right: 0;
  bottom: 42px;
  z-index: 30;
  min-width: 150px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 8px;
  background: var(--en-surface);
}

.en-note-popover button {
  min-height: 32px;
  border: 0;
  border-radius: 6px;
  color: var(--en-text);
  background: transparent;
  font: inherit;
  text-align: left;
}

.en-icon {
  width: 20px;
  height: 20px;
}

.en-icon-small {
  width: 14px;
  height: 14px;
}
</style>
