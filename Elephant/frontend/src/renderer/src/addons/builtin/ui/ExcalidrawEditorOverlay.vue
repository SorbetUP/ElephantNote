<template>
  <ExcalidrawDialog
    v-if="isOpen"
    :title="title"
    :file-name="fileName"
    :theme="shellTheme"
    :initial-blob="initialBlob"
    :save-mode="saveMode"
    :insert-on-save="insertOnSave"
    @close="close"
    @save="save"
  />
</template>

<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import bus from '@/bus'
import { useEditorStore } from '@/store/editor'
import ExcalidrawDialog from 'elephant-front/components/editor/ExcalidrawDialog.vue'
import { useVaultStore } from 'elephant-front/stores/vaultStore'
import { getExcalidrawPreviewPath, getExcalidrawScenePath } from 'elephant-front/services/excalidraw'
import { resolveLocalImageSource, toMarkdownImageSource } from 'elephant-shared/imageSource'
import {
  ELEPHANTNOTE_ASSETS_DIR,
  getVaultAssetRelativePath,
  isHiddenAssetPath,
  sanitizeAssetName
} from 'elephant-shared/excalidrawAssets'

const editorStore = useEditorStore()
const vaultStore = useVaultStore()
const { currentFile } = storeToRefs(editorStore)
const shellTheme = inject('elephantnoteTheme', ref(window.localStorage.getItem('elephantnote:theme') || 'light'))

const isOpen = ref(false)
const initialBlob = ref(null)
const targetPath = ref('')
const scenePath = ref('')
const insertOnSave = ref(false)
const fileName = ref('excalidraw.png')
const title = ref('Excalidraw')
const saveMode = ref('png')

const activeFile = computed(() => {
  const openedPath = vaultStore.openedNotePath
  if (openedPath && vaultStore.activeVault?.path) {
    const absolutePath = window.path.join(vaultStore.activeVault.path, openedPath)
    const tab = editorStore.tabs.find((entry) => entry?.pathname && window.fileUtils.isSamePathSync(entry.pathname, absolutePath))
    if (tab) return tab
  }
  return currentFile.value || null
})

const currentNoteDirectory = computed(() => {
  const pathname = activeFile.value?.pathname
  if (pathname) return window.path.dirname(pathname)
  if (vaultStore.activeVault?.path) return window.path.join(vaultStore.activeVault.path, vaultStore.currentPath || '')
  return ''
})

const log = (level, message, details = {}) => {
  const logger = console[level] || console.log
  logger.call(console, message, details)
}

const pathExists = (pathname) => Boolean(pathname && window.fileUtils?.pathExistsSync?.(pathname))
const normalizeSlashPath = (pathname = '') => String(pathname || '').replace(/\\/g, '/')
const isVaultAssetAbsolutePath = (pathname = '') => {
  const root = vaultStore.activeVault?.path
  if (!root || !pathname) return false
  const relative = normalizeSlashPath(window.path.relative(root, pathname))
  return isHiddenAssetPath(relative) && relative.split('/')[0] === ELEPHANTNOTE_ASSETS_DIR
}

const ensureAssetsDirectory = async () => {
  const root = vaultStore.activeVault?.path
  if (!root) throw new Error('Cannot use Excalidraw without an active vault.')
  const directory = window.path.join(root, ELEPHANTNOTE_ASSETS_DIR)
  await window.fileUtils.ensureDir(directory)
  return directory
}

const assetName = (value = '') => sanitizeAssetName(
  value || `excalidraw-${Date.now()}.png`,
  `excalidraw-${Date.now()}.png`
)

const uniqueAssetPath = async (preferredName = '') => {
  const directory = await ensureAssetsDirectory()
  const safeName = assetName(preferredName)
  const extension = window.path.extname(safeName)
  const baseName = extension ? safeName.slice(0, -extension.length) : safeName
  let index = 0
  let candidate = window.path.join(directory, safeName)
  while (pathExists(candidate)) {
    index += 1
    candidate = window.path.join(directory, `${baseName}-${index}${extension}`)
  }
  return candidate
}

const readBlob = async (pathname, type = '') => {
  const content = await window.fileUtils.readFile(pathname)
  if (content instanceof Blob) return content
  return new Blob([content], type ? { type } : undefined)
}

const copyFile = async (source, target, type = '') => {
  await window.fileUtils.ensureDir(window.path.dirname(target))
  if (normalizeSlashPath(source) === normalizeSlashPath(target)) return target
  if (typeof window.fileUtils?.copyFile === 'function') {
    await window.fileUtils.copyFile(source, target)
    return target
  }
  await window.fileUtils.writeFile(target, await readBlob(source, type))
  return target
}

const copyDrawingIntoVault = async (sourcePreviewPath) => {
  if (!sourcePreviewPath || !pathExists(sourcePreviewPath)) return ''
  if (isVaultAssetAbsolutePath(sourcePreviewPath)) return sourcePreviewPath
  const destination = await uniqueAssetPath(window.path.basename(sourcePreviewPath))
  await copyFile(sourcePreviewPath, destination)
  const sourceScene = getExcalidrawScenePath(sourcePreviewPath)
  if (sourceScene && sourceScene !== sourcePreviewPath && pathExists(sourceScene)) {
    await copyFile(sourceScene, getExcalidrawScenePath(destination), 'application/vnd.excalidraw+json')
  }
  return destination
}

const targetAssetPath = async (preferredName = '') => {
  const root = vaultStore.activeVault?.path
  if (!root) throw new Error('Cannot use Excalidraw without an active vault.')
  await ensureAssetsDirectory()
  return window.path.join(root, getVaultAssetRelativePath(assetName(preferredName)))
}

const open = async ({ markdown, fileName: requestedName, title: requestedTitle, saveMode: requestedMode, insertOnSave: shouldInsert } = {}) => {
  const nextName = assetName(requestedName || `excalidraw-${Date.now()}.png`)
  const nextTarget = await targetAssetPath(nextName)
  targetPath.value = nextTarget
  scenePath.value = getExcalidrawScenePath(nextTarget)
  title.value = requestedTitle || 'Excalidraw'
  fileName.value = nextName
  saveMode.value = requestedMode || 'png'
  insertOnSave.value = Boolean(shouldInsert)
  initialBlob.value = markdown instanceof Blob ? markdown : null
  isOpen.value = true
  log('info', '[excalidraw-addon] editor opened', { targetPath: nextTarget, insertOnSave: insertOnSave.value })
}

const openFromImage = async (src) => {
  try {
    const imagePath = resolveLocalImageSource(src, currentNoteDirectory.value)
    if (!imagePath) return
    const rawPreviewPath = window.path.extname(imagePath).toLowerCase() === '.excalidraw'
      ? getExcalidrawPreviewPath(imagePath)
      : imagePath
    const previewPath = await copyDrawingIntoVault(rawPreviewPath)
    if (!previewPath) return
    const nextScenePath = getExcalidrawScenePath(previewPath)
    const blob = pathExists(nextScenePath)
      ? await readBlob(nextScenePath, 'application/vnd.excalidraw+json')
      : pathExists(previewPath) ? await readBlob(previewPath) : null

    await open({
      markdown: blob,
      fileName: window.path.basename(previewPath),
      title: 'Excalidraw',
      saveMode: 'png',
      insertOnSave: false
    })
    targetPath.value = previewPath
    scenePath.value = nextScenePath
  } catch (error) {
    log('error', '[excalidraw-addon] failed to open drawing', { error: error?.message || String(error) })
  }
}

const close = () => {
  isOpen.value = false
  initialBlob.value = null
}

const appendPreviewToNote = (previewPath, resolvedName) => {
  const file = activeFile.value
  if (!file) return
  const source = toMarkdownImageSource(previewPath, vaultStore.activeVault?.path || currentNoteDirectory.value)
  const imageMarkdown = `![${resolvedName}](${source})`
  const nextMarkdown = [String(file.markdown || '').trimEnd(), imageMarkdown].filter(Boolean).join('\n\n')
  file.markdown = nextMarkdown
  file.isSaved = false
  if (currentFile.value?.id === file.id) {
    currentFile.value.markdown = nextMarkdown
    currentFile.value.isSaved = false
  }
}

const save = async ({ imageBlob, blob, sceneBlob, fileName: requestedName } = {}) => {
  const writableImage = imageBlob || blob
  if (!writableImage) throw new Error('Excalidraw did not provide an image payload.')
  const resolvedName = assetName(requestedName || fileName.value)
  const destination = targetPath.value && window.path.basename(targetPath.value) === resolvedName
    ? targetPath.value
    : await targetAssetPath(resolvedName)
  const destinationScene = getExcalidrawScenePath(destination)
  await window.fileUtils.ensureDir(window.path.dirname(destination))
  await window.fileUtils.writeFile(destination, writableImage)
  if (sceneBlob) await window.fileUtils.writeFile(destinationScene, sceneBlob)
  targetPath.value = destination
  scenePath.value = destinationScene
  fileName.value = resolvedName
  if (insertOnSave.value) appendPreviewToNote(destination, resolvedName)
  bus.emit('invalidate-image-cache')
  close()
}

onMounted(() => {
  bus.on('ELEPHANT::open-excalidraw', open)
  bus.on('open-excalidraw-from-image', openFromImage)
})

onBeforeUnmount(() => {
  bus.off('ELEPHANT::open-excalidraw', open)
  bus.off('open-excalidraw-from-image', openFromImage)
  close()
})
</script>
