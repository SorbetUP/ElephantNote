from pathlib import Path

ROOT = Path('.')


def load(path):
    return (ROOT / path).read_text(encoding='utf-8')


def save(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_once(path, old, new):
    text = load(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one occurrence, got {count}: {old[:100]!r}')
    save(path, text.replace(old, new, 1))


editor = 'Elephant/frontend/src/renderer/src/components/editorWithTabs/editor.vue'
replace_once(
    editor,
    '''let printer = null
let spellchecker = null
let switchLanguageCommand = null
let imageViewer = null
''',
    '''let printer = null
let spellchecker = null
let switchLanguageCommand = null
let imageViewer = null
let boundDocumentId = ''
let suppressEditorChangesUntil = 0
const PROGRAMMATIC_CHANGE_GUARD_MS = 350

const beginProgrammaticEditorUpdate = (documentId, callback) => {
  boundDocumentId = documentId || currentFile.value?.id || boundDocumentId
  suppressEditorChangesUntil = Date.now() + PROGRAMMATIC_CHANGE_GUARD_MS
  callback()
}
'''
)
replace_once(
    editor,
    '''const setMarkdownToEditor = ({ markdown: newMarkdown, cursor: newCursor }) => {
  if (editor.value) {
    const editorMarkdown = props.toEditorMarkdown(newMarkdown)
    editor.value.clearHistory()
    if (newCursor) {
      editor.value.setMarkdown(editorMarkdown, newCursor, true)
    } else {
      editor.value.setMarkdown(editorMarkdown)
    }
  }
}''',
    '''const setMarkdownToEditor = ({ id, markdown: newMarkdown, cursor: newCursor }) => {
  if (editor.value) {
    const editorMarkdown = props.toEditorMarkdown(newMarkdown)
    beginProgrammaticEditorUpdate(id, () => {
      editor.value.clearHistory()
      if (newCursor) {
        editor.value.setMarkdown(editorMarkdown, newCursor, true)
      } else {
        editor.value.setMarkdown(editorMarkdown)
      }
    })
  }
}'''
)
replace_once(
    editor,
    '''const handleFileChange = ({
  markdown: newMarkdown,
  cursor: newCursor,
  renderCursor,
  history,
  scrollTop,
  muyaIndexCursor,
  blocks = undefined
}) => {''',
    '''const handleFileChange = ({
  id,
  markdown: newMarkdown,
  cursor: newCursor,
  renderCursor,
  history,
  scrollTop,
  muyaIndexCursor,
  blocks = undefined
}) => {'''
)
replace_once(
    editor,
    '''      editor.value.setMarkdown(editorMarkdown, newCursor, renderCursor, muyaIndexCursor, blocks)
    } else if (newCursor) {''',
    '''      beginProgrammaticEditorUpdate(id, () => {
        editor.value.setMarkdown(editorMarkdown, newCursor, renderCursor, muyaIndexCursor, blocks)
      })
    } else if (newCursor) {'''
)
old_plugins = '''  // use muya UI plugins
  Muya.use(TablePicker)
  Muya.use(QuickInsert)
  Muya.use(CodePicker)
  Muya.use(EmojiPicker)
  Muya.use(ImagePathPicker)
  Muya.use(ImageSelector, {
    unsplashAccessKey: process.env.UNSPLASH_ACCESS_KEY,
    photoCreatorClick
  })
  Muya.use(Transformer)
  Muya.use(ImageToolbar)
  Muya.use(FormatPicker)
  Muya.use(FrontMenu)
  Muya.use(LinkTools, {
    jumpClick
  })
  Muya.use(FootnoteTool)
  Muya.use(TableBarTools)
'''
new_plugins = '''  // Muya plugins are global. Registering them on every editor mount duplicates
  // floating menus and event handlers across tab switches.
  if (!globalThis.__ELEPHANT_MUYA_PLUGINS_INSTALLED__) {
    Muya.use(TablePicker)
    Muya.use(QuickInsert)
    Muya.use(CodePicker)
    Muya.use(EmojiPicker)
    Muya.use(ImagePathPicker)
    Muya.use(ImageSelector, {
      unsplashAccessKey: process.env.UNSPLASH_ACCESS_KEY,
      photoCreatorClick
    })
    Muya.use(Transformer)
    Muya.use(ImageToolbar)
    Muya.use(FormatPicker)
    Muya.use(FrontMenu)
    Muya.use(LinkTools, {
      jumpClick
    })
    Muya.use(FootnoteTool)
    Muya.use(TableBarTools)
    globalThis.__ELEPHANT_MUYA_PLUGINS_INSTALLED__ = true
  }
'''
replace_once(editor, old_plugins, new_plugins)
replace_once(
    editor,
    '''  editor.value = new Muya(ele, options)

  const { container } = editor.value''',
    '''  boundDocumentId = currentFile.value?.id || ''
  suppressEditorChangesUntil = Date.now() + PROGRAMMATIC_CHANGE_GUARD_MS
  editor.value = new Muya(ele, options)

  const { container } = editor.value'''
)
old_change = '''  editor.value.on('change', (changes) => {
    // There is a chance that this event is fired AFTER the tab is switched. If we purely rely on this.currentFile later on
    // it can cause invalid updates. Hence, we need the id to identify changes as part of each tab
    const { id } = currentFile.value
    if (id) {
      const nextChanges = {
        ...changes,
        markdown: props.fromEditorMarkdown(changes.markdown)
      }
      editorStore.LISTEN_FOR_CONTENT_CHANGE(Object.assign(nextChanges, { id }))
    }
  })'''
new_change = '''  editor.value.on('change', (changes) => {
    // setMarkdown() may emit a normal change event. Treat it as hydration, never
    // as a user edit, otherwise opening a tab can rewrite the file on disk.
    if (Date.now() < suppressEditorChangesUntil) return
    const id = boundDocumentId || currentFile.value?.id
    const target = editorStore.tabs.find((tab) => tab.id === id)
    if (!id || !target) return
    const documentMarkdown = props.fromEditorMarkdown(changes.markdown)
    const nextChanges = {
      ...changes,
      markdown: documentMarkdown
    }
    editorStore.LISTEN_FOR_CONTENT_CHANGE(Object.assign(nextChanges, { id }))
    window.dispatchEvent(
      new CustomEvent('elephantnote:editor-user-change', {
        detail: {
          id,
          pathname: target.pathname || '',
          markdown: documentMarkdown
        }
      })
    )
  })'''
replace_once(editor, old_change, new_change)


host = 'Elephant/frontend/app/components/editor/NoteEditorHost.vue'
replace_once(host, 'const AUTOSAVE_POLL_MS = 500\n', '')
replace_once(host, 'let noteSaveInterval = null\n', '')
replace_once(
    host,
    '''const getActiveNoteFile = () => {
  const pathname = openedNoteAbsolutePath.value
  if (!pathname) return currentFile.value
  const tab = findTabByPath(pathname)
  if (tab) return tab
  if (
    currentFile.value?.pathname &&
    window.fileUtils.isSamePathSync(currentFile.value.pathname, pathname)
  ) {
    return currentFile.value
  }
  return null
}''',
    '''const getActiveNoteFile = () => {
  const pathname = openedNoteAbsolutePath.value
  if (!pathname) return currentFile.value
  const tab = findTabByPath(pathname)
  if (tab) return tab
  if (
    currentFile.value?.pathname &&
    window.fileUtils.isSamePathSync(currentFile.value.pathname, pathname)
  ) {
    return currentFile.value
  }
  return null
}
const notePathForFile = (file) => {
  const vaultPath = store.activeVault?.path
  const pathname = file?.pathname
  if (!vaultPath || !pathname) return ''
  const relativePath = window.path.relative(vaultPath, pathname)
  if (!relativePath || relativePath.startsWith('..') || window.path.isAbsolute(relativePath)) return ''
  return relativePath
}
const liveFileForSnapshot = (file, notePath, nextMarkdown) => {
  if (!file?.id) return null
  const live = editorStore.tabs.find((tab) => tab.id === file.id)
  if (!live || notePathForFile(live) !== notePath || live.markdown !== nextMarkdown) return null
  return live
}'''
)
replace_once(
    host,
    '''  noteSaveTimer = window.setTimeout(() => {
    noteSaveTimer = null
    void persistNoteMarkdown(notePath, nextMarkdown, file, reason)
  }, effectiveDelay)''',
    '''  noteSaveTimer = window.setTimeout(() => {
    noteSaveTimer = null
    const liveFile = liveFileForSnapshot(file, notePath, nextMarkdown)
    if (!liveFile) {
      pushEditorLog('info', '[elephantnote:save] stale scheduled write skipped', {
        notePath,
        fileId: file?.id,
        reason
      })
      return
    }
    void persistNoteMarkdown(notePath, nextMarkdown, liveFile, reason)
  }, effectiveDelay)'''
)
old_observe_poll = '''const rememberObservedMarkdown = (notePath, nextMarkdown, file, reason = 'observe') => {
  lastSeenNotePath = notePath
  lastSeenMarkdown = nextMarkdown
  pushEditorLog('info', '[elephantnote:save] observed active markdown', {
    notePath,
    length: nextMarkdown.length,
    reason,
    isSaved: file?.isSaved
  })
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
  const editDelta = estimateEditDelta(lastSeenMarkdown, nextMarkdown)
  lastSeenMarkdown = nextMarkdown
  scheduleNoteSave(notePath, nextMarkdown, file, AUTOSAVE_DELAY_MS, reason, editDelta)
}
'''
new_observe_poll = '''const rememberObservedMarkdown = (notePath, nextMarkdown, file, reason = 'observe') => {
  lastSeenNotePath = notePath
  lastSeenMarkdown = nextMarkdown
  pushEditorLog('info', '[elephantnote:save] observed active markdown', {
    notePath,
    length: nextMarkdown.length,
    reason,
    isSaved: file?.isSaved
  })
  if (file?.isSaved !== false) {
    lastSavedNotePath = notePath
    lastSavedMarkdown = nextMarkdown
  }
}

const handleEditorUserChange = (event) => {
  const detail = event?.detail || {}
  const file = editorStore.tabs.find((tab) => tab.id === detail.id)
  const notePath = notePathForFile(file)
  const nextMarkdown = detail.markdown
  if (!file || !notePath || typeof nextMarkdown !== 'string') return
  if (file.markdown !== nextMarkdown) return
  const previousMarkdown = lastSeenNotePath === notePath ? lastSeenMarkdown : lastSavedMarkdown
  const editDelta = estimateEditDelta(previousMarkdown, nextMarkdown)
  lastSeenNotePath = notePath
  lastSeenMarkdown = nextMarkdown
  scheduleNoteSave(notePath, nextMarkdown, file, AUTOSAVE_DELAY_MS, 'muya-user-change', editDelta)
}
'''
replace_once(host, old_observe_poll, new_observe_poll)
replace_once(
    host,
    '''  if (!notePath || !file?.id || typeof nextMarkdown !== 'string') return false
  if (lastSavedNotePath === notePath && lastSavedMarkdown === nextMarkdown) return true''',
    '''  if (!notePath || !file?.id || typeof nextMarkdown !== 'string') return false
  if (file.isSaved !== false) return true
  if (lastSavedNotePath === notePath && lastSavedMarkdown === nextMarkdown) return true'''
)
old_watch = '''watch(
  () => ({
    notePath: currentNoteRelativePath.value || store.openedNotePath,
    markdown: markdown.value,
    file: activeNoteFile.value || currentFile.value
  }),
  ({ notePath, markdown: nextMarkdown, file }, previous) => {
    if (!notePath || !file?.id || typeof nextMarkdown !== 'string') return
    if (previous?.notePath !== notePath) {
      rememberObservedMarkdown(notePath, nextMarkdown, file, 'vue-watch')
      return
    }
    if (previous?.markdown === nextMarkdown) return
    const editDelta = estimateEditDelta(previous?.markdown, nextMarkdown)
    lastSeenNotePath = notePath
    lastSeenMarkdown = nextMarkdown
    scheduleNoteSave(notePath, nextMarkdown, file, AUTOSAVE_DELAY_MS, 'vue-watch', editDelta)
  }
)'''
new_watch = '''watch(
  () => ({
    notePath: currentNoteRelativePath.value || store.openedNotePath,
    markdown: markdown.value,
    file: activeNoteFile.value || currentFile.value
  }),
  ({ notePath, markdown: nextMarkdown, file }, previous) => {
    if (!notePath || !file?.id || typeof nextMarkdown !== 'string') return
    const identityChanged = previous?.notePath !== notePath || previous?.file?.id !== file.id
    if (identityChanged) {
      if (noteSaveTimer) {
        window.clearTimeout(noteSaveTimer)
        noteSaveTimer = null
      }
      rememberObservedMarkdown(notePath, nextMarkdown, file, 'document-switch')
      return
    }
    // Generic reactive changes include disk hydration and tab restoration. They
    // update the baseline only; only the explicit Muya user-change event saves.
    lastSeenNotePath = notePath
    lastSeenMarkdown = nextMarkdown
  }
)'''
replace_once(host, old_watch, new_watch)
old_mount = '''onMounted(() => {
  pushEditorLog('info', '[elephantnote:editor] mounted', {
    notePath: currentNoteRelativePath.value,
    vault: store.activeVault?.path
  })
  bus.on('ELEPHANT::open-excalidraw', openExcalidraw)
  bus.on('open-excalidraw-from-image', openExcalidrawFromImage)
  pollActiveMarkdownSave('mount')
  noteSaveInterval = window.setInterval(() => pollActiveMarkdownSave('interval'), AUTOSAVE_POLL_MS)
})
onBeforeUnmount(() => {
  pushEditorLog('info', '[elephantnote:editor] before unmount', {
    notePath: currentNoteRelativePath.value
  })
  bus.off('ELEPHANT::open-excalidraw', openExcalidraw)
  bus.off('open-excalidraw-from-image', openExcalidrawFromImage)
  if (noteSaveInterval) {
    window.clearInterval(noteSaveInterval)
    noteSaveInterval = null
  }
  void flushActiveNoteSave('unmount')
})'''
new_mount = '''onMounted(() => {
  pushEditorLog('info', '[elephantnote:editor] mounted', {
    notePath: currentNoteRelativePath.value,
    vault: store.activeVault?.path
  })
  bus.on('ELEPHANT::open-excalidraw', openExcalidraw)
  bus.on('open-excalidraw-from-image', openExcalidrawFromImage)
  window.addEventListener('elephantnote:editor-user-change', handleEditorUserChange)
  const file = getActiveNoteFile() || currentFile.value
  const notePath = notePathForFile(file) || currentNoteRelativePath.value || store.openedNotePath
  if (notePath && file?.id && typeof file.markdown === 'string') {
    rememberObservedMarkdown(notePath, file.markdown, file, 'mount-baseline')
  }
})
onBeforeUnmount(() => {
  pushEditorLog('info', '[elephantnote:editor] before unmount', {
    notePath: currentNoteRelativePath.value
  })
  bus.off('ELEPHANT::open-excalidraw', openExcalidraw)
  bus.off('open-excalidraw-from-image', openExcalidrawFromImage)
  window.removeEventListener('elephantnote:editor-user-change', handleEditorUserChange)
  void flushActiveNoteSave('unmount')
})'''
replace_once(host, old_mount, new_mount)

print('Editor state ownership patch applied.')
