const normalizePath = (value = '') => String(value || '').replace(/\\/g, '/')
const MARKDOWN_EXTENSION_RE = /\.md$/i
const saveQueues = new Map()
const saveGenerations = new Map()

const isMarkdownPath = (value = '') => MARKDOWN_EXTENSION_RE.test(normalizePath(value))

const getSaveTarget = (target, record = {}) => {
  if (record.pathname) return record.pathname
  if (!record.filename) return ''
  const defaultPath = record.defaultPath || ''
  return target.path?.join?.(defaultPath, record.filename) || `${defaultPath}/${record.filename}`
}

const getRecordFromArgs = ([id, filename, pathname, markdown, options, defaultPath]) => ({
  id,
  filename,
  pathname,
  markdown,
  options,
  defaultPath
})

const writeViaRustBackend = async(target, pathname, markdown) => {
  const invoke = target.__TAURI__?.core?.invoke
  if (typeof invoke !== 'function') {
    throw new Error('Tauri save bridge cannot write: core.invoke is unavailable.')
  }
  const result = await invoke('tauri_marktext_write_file_atomic', {
    pathname,
    content: markdown
  })
  if (result?.ok !== true || result?.atomic !== true) {
    throw new Error(`Atomic note writer returned an invalid acknowledgement: ${JSON.stringify(result)}`)
  }
  return result
}

const enqueueAtomicWrite = (target, pathname, markdown) => {
  const key = normalizePath(pathname)
  const previous = saveQueues.get(key) || Promise.resolve()
  const next = previous
    .catch(() => undefined)
    .then(() => writeViaRustBackend(target, pathname, markdown))
  saveQueues.set(key, next)
  void next.finally(() => {
    if (saveQueues.get(key) === next) saveQueues.delete(key)
  }).catch(() => undefined)
  return next
}

const nextSaveGeneration = (id) => {
  const generation = Number(saveGenerations.get(id) || 0) + 1
  saveGenerations.set(id, generation)
  return generation
}

const isLatestSaveGeneration = (id, generation) => saveGenerations.get(id) === generation

const writeRecord = async(target, ipc, record = {}, reason = 'save') => {
  const pathname = getSaveTarget(target, record)
  const id = record.id
  const markdown = typeof record.markdown === 'string' ? record.markdown : ''

  if (!id) {
    console.warn('[tauri:marktext-save] ignored save without tab id', { reason, pathname })
    return false
  }

  if (!pathname) {
    const message = 'Cannot save this note because no path was provided.'
    console.error('[tauri:marktext-save] write:failed', { reason, id, message })
    ipc.send('mt::tab-save-failure', id, message)
    return false
  }

  if (!isMarkdownPath(pathname)) {
    const message = `Refusing to save markdown content into a non-markdown file: ${normalizePath(pathname)}`
    console.error('[tauri:marktext-save] write:blocked-non-markdown', { reason, id, pathname: normalizePath(pathname) })
    ipc.send('mt::tab-save-failure', id, message)
    return false
  }

  const generation = nextSaveGeneration(id)
  try {
    console.info('[tauri:marktext-save] write:start', {
      reason,
      id,
      generation,
      pathname: normalizePath(pathname),
      length: markdown.length,
      atomic: true,
      serialized: true
    })

    const result = await enqueueAtomicWrite(target, pathname, markdown)
    const latest = isLatestSaveGeneration(id, generation)

    console.info('[tauri:marktext-save] write:done', {
      reason,
      id,
      generation,
      latest,
      pathname: normalizePath(pathname),
      length: markdown.length,
      changed: result.changed === true,
      atomic: result.atomic === true
    })

    // An older completed write must never mark the tab saved while a newer
    // revision is still queued. Only the newest generation may acknowledge
    // `isSaved: true` or permit a save-and-close request to close the tab.
    if (latest) {
      ipc.send('mt::tab-saved', id)
      return true
    }

    console.info('[tauri:marktext-save] write:superseded', {
      reason,
      id,
      generation,
      latestGeneration: saveGenerations.get(id),
      pathname: normalizePath(pathname)
    })
    return false
  } catch (error) {
    const message = error?.message || String(error)
    const latest = isLatestSaveGeneration(id, generation)
    console.error('[tauri:marktext-save] write:failed', {
      reason,
      id,
      generation,
      latest,
      pathname: normalizePath(pathname),
      error: message
    })
    if (latest) ipc.send('mt::tab-save-failure', id, message)
    return false
  }
}

const normalizeRecords = (records = []) => Array.isArray(records) ? records : [records]

export const installTauriMarkTextSaveBridge = (target = globalThis) => {
  if (!target?.__TAURI__ || target.__TAURI_MARKTEXT_SAVE_BRIDGE_INSTALLED__) return false
  const ipc = target.tauri?.ipcRenderer
  if (!ipc?.on || !ipc?.send) return false
  target.__TAURI_MARKTEXT_SAVE_BRIDGE_INSTALLED__ = true

  ipc.on('mt::response-file-save', (_event, ...args) => {
    void writeRecord(target, ipc, getRecordFromArgs(args), 'response-file-save')
  })

  ipc.on('mt::response-file-save-as', (_event, ...args) => {
    void writeRecord(target, ipc, getRecordFromArgs(args), 'response-file-save-as')
  })

  ipc.on('mt::save-tabs', (_event, records = []) => {
    for (const record of normalizeRecords(records)) {
      void writeRecord(target, ipc, record, 'save-tabs')
    }
  })

  ipc.on('mt::save-and-close-tabs', (_event, records = []) => {
    const normalized = normalizeRecords(records)
    void Promise.all(normalized.map((record) => writeRecord(target, ipc, record, 'save-and-close-tabs')))
      .then((results) => {
        const closeIds = normalized
          .filter((_record, index) => results[index])
          .map((record) => record.id)
          .filter(Boolean)
        if (closeIds.length) ipc.send('mt::force-close-tabs-by-id', closeIds)
      })
  })

  console.info('[tauri:marktext-save] bridge:installed', {
    atomic: true,
    serialized: true,
    latestRevisionAcknowledgement: true
  })
  return true
}
