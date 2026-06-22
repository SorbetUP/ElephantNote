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
import {
  getOppositeThemeVariant,
  getThemeMode
} from 'common/elephantnote/appearance'
import { useSearchStore } from '../../stores/searchStore'
import { resolveLocalImageSource } from '../../../../shared/imageSource.js'

const mainStore = useMainStore()
const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()
const store = useVaultStore()
const searchStore = useSearchStore()

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

watch(openedNoteAbsolutePath, selectOpenedNoteTab, { immediate: true })
watch(() => editorStore.tabs.length, selectOpenedNoteTab)

const updateCurrentFileMarkdown = (nextMarkdown) => {
  const file = activeNoteFile.value || currentFile.value
  if (!file) return
  file.markdown = nextMarkdown
  file.isSaved = false
  if (currentFile.value && file.id === currentFile.value.id) {
    currentFile.value.markdown = nextMarkdown
    currentFile.value.isSaved = false
  }
  if (store.openedNotePath) searchStore.updateNoteIndex(store.openedNotePath, nextMarkdown)
}

const updateTitle = (nextTitle) => updateCurrentFileMarkdown(renameDocumentTitle(markdown.value, nextTitle, fallbackTitle.value))
const togglePin = () => {
  const pathname = currentNoteRelativePath.value
  if (pathname) store.togglePin(pathname)
}

const startTagCreation = () => { isAddingTag.value = true; isEditingTag.value = false; editingTagIndex.value = -1; tagDraft.value = '' }
const beginEditTag = (index) => { isEditingTag.value = true; isAddingTag.value = false; editingTagIndex.value = index; tagDraft.value = tags.value[index] || '' }
const cancelTag = () => { isAddingTag.value = false; isEditingTag.value = false; editingTagIndex.value = -1; tagDraft.value = '' }
const submitTag = () => {
  const tag = tagDraft.value.trim()
  if (!tag) { cancelTag(); return }
  updateCurrentFileMarkdown(updateMarkdownTags(markdown.value, tag, isEditingTag.value ? editingTagIndex.value : -1))
  cancelTag()
}
const deleteTag = (index) => updateCurrentFileMarkdown(deleteMarkdownTag(markdown.value, index))
const setTextScale = (value) => { textScale.value = value; window.localStorage.setItem('elephantnote:editorTextScale', value) }
const toggleTheme = () => {
  const next = getOppositeThemeVariant(shellTheme.value)
  shellTheme.value = next
  setShellTheme(next)
}
const openGraphView = () => bus.emit('ELEPHANT::set-main-view', 'graph')

const openExcalidraw = async({ markdown, fileName, title, saveMode, insertOnSave, refreshOnSave }) => {
  const baseDir = currentNoteDirectory.value
  const targetName = fileName || `drawing-${Date.now()}.png`
  const targetPath = window.path.join(baseDir, targetName)
  const scenePath = getExcalidrawScenePath(targetPath)
  excalidrawTitle.value = title || 'Excalidraw'
  excalidrawFileName.value = targetName
  excalidrawSaveMode.value = saveMode || 'png'
  excalidrawInsertOnSave.value = !!insertOnSave
  excalidrawRefreshOnSave.value = !!refreshOnSave
  excalidrawTargetPath.value = targetPath
  excalidrawScenePath.value = scenePath
  excalidrawPreviewPath.value = getExcalidrawPreviewPath(targetPath)
  excalidrawInitialBlob.value = markdown || ''
  isExcalidrawOpen.value = true
}
const closeExcalidraw = () => { isExcalidrawOpen.value = false; excalidrawInitialBlob.value = null }
const saveExcalidraw = async({ imageBlob, sceneBlob }) => {
  await window.fileUtils.ensureDir(window.path.dirname(excalidrawTargetPath.value))
  await window.fileUtils.writeFile(excalidrawTargetPath.value, imageBlob)
  if (sceneBlob) await window.fileUtils.writeFile(excalidrawScenePath.value, sceneBlob)
  if (excalidrawInsertOnSave.value) {
    const source = resolveLocalImageSource(excalidrawTargetPath.value, { notePath: currentFile.value?.pathname, vaultPath: store.activeVault?.path })
    updateCurrentFileMarkdown(`${markdown.value}\n\n![${excalidrawFileName.value}](${source})`)
  }
  closeExcalidraw()
}

onMounted(() => {
  bus.on('ELEPHANT::open-excalidraw', openExcalidraw)
})
onBeforeUnmount(() => {
  bus.off('ELEPHANT::open-excalidraw', openExcalidraw)
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
