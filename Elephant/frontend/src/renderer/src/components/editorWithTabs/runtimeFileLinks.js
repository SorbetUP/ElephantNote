const PDF_EXTENSION = /\.pdf(?:[?#].*)?$/i
const EXTERNAL_SCHEME = /^(?:https?|mailto):/i
const FILE_SCHEME = /^file:\/\//i

const fileOpenHistory = (target = globalThis) => {
  target.__ELEPHANT_FILE_OPEN_HISTORY__ = Array.isArray(target.__ELEPHANT_FILE_OPEN_HISTORY__)
    ? target.__ELEPHANT_FILE_OPEN_HISTORY__
    : []
  return target.__ELEPHANT_FILE_OPEN_HISTORY__
}

const recordOpen = (entry, target = globalThis) => {
  const history = fileOpenHistory(target)
  history.push({ at: new Date().toISOString(), ...entry })
  if (history.length > 100) history.splice(0, history.length - 100)
  return entry
}

const markDroppedUserMutation = (target = globalThis, reason = 'drop:file') => {
  target.__ELEPHANT_ACTIVE_MUYA__?.__onUserMutation?.(reason)
}

const insertDroppedMarkdown = async (markdown, dispatch, target = globalThis) => {
  const muya = target.__ELEPHANT_ACTIVE_MUYA__
  if (typeof muya?.__applyRust === 'function' && typeof muya?.__selection === 'function') {
    return muya.__applyRust('drop-file-attachment', (engine) => {
      const selection = muya.__selection().selection
      return engine.replaceRange(selection.anchor, selection.focus, String(markdown || ''))
    })
  }
  return dispatch('insert-text', markdown)
}

const escapeLabel = (value) => String(value || 'file')
  .replace(/\\/g, '\\\\')
  .replace(/([\[\]])/g, '\\$1')

const encodeMarkdownPath = (value) => encodeURI(String(value || '').replace(/\\/g, '/'))
  .replace(/\(/g, '%28')
  .replace(/\)/g, '%29')

const safeName = (value) => {
  const normalized = String(value || 'file').replace(/[\\/:*?"<>|]/g, '-').trim()
  return normalized || 'file'
}

const nextAvailablePath = async (directory, name, fileUtils, pathApi) => {
  const parsed = pathApi.parse(safeName(name))
  for (let index = 0; index < 10000; index += 1) {
    const suffix = index === 0 ? '' : `-${index}`
    const candidate = pathApi.join(directory, `${parsed.name}${suffix}${parsed.ext}`)
    const exists = typeof fileUtils.pathExists === 'function'
      ? await fileUtils.pathExists(candidate)
      : Boolean(fileUtils.pathExistsSync?.(candidate))
    if (!exists) return candidate
  }
  throw new Error(`Unable to allocate an attachment path for ${name}.`)
}

export const storeDroppedAttachment = async ({ file, currentFile, projectRoot, target = globalThis }) => {
  const fileUtils = target.fileUtils
  const pathApi = target.path
  if (!fileUtils || !pathApi) throw new Error('Desktop file services are unavailable.')
  if (!currentFile?.pathname) throw new Error('Save the note before attaching a file.')
  if (!projectRoot?.pathname) throw new Error('No active vault is available.')

  const assetsDirectory = pathApi.join(projectRoot.pathname, '.assets')
  await fileUtils.ensureDir(assetsDirectory)
  const destination = await nextAvailablePath(assetsDirectory, file?.name || 'file', fileUtils, pathApi)
  const nativePath = target.tauri?.webUtils?.getPathForFile?.(file) || file?.path || ''
  let copied = false

  if (nativePath && nativePath !== file?.name) {
    try {
      await fileUtils.copy(nativePath, destination)
      copied = true
    } catch {
      copied = false
    }
  }
  if (!copied) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    await fileUtils.writeFile(destination, bytes, 'binary')
  }

  const relativePath = pathApi.relative(pathApi.dirname(currentFile.pathname), destination).replace(/\\/g, '/')
  return {
    absolutePath: destination,
    relativePath,
    markdown: `[${escapeLabel(file?.name)}](${encodeMarkdownPath(relativePath)})`
  }
}

export const createRuntimeFileHandlers = ({
  currentFile,
  projectTree,
  dispatch,
  dropImage,
  target = globalThis
}) => ({
  dropped: async (files) => {
    const list = Array.from(files || [])
    if (!list.length) return false
    const image = list.find((file) => /^image\//i.test(file.type || ''))
    if (image) return dropImage([image])

    markDroppedUserMutation(target)
    const attachment = await storeDroppedAttachment({
      file: list[0],
      currentFile: currentFile.value,
      projectRoot: projectTree.value,
      target
    })
    await insertDroppedMarkdown(attachment.markdown, dispatch, target)
    return attachment
  }
})

const invokePdfViewer = async (viewer, path, context) => {
  if (typeof viewer === 'function') return viewer(path, context)
  if (typeof viewer?.open === 'function') return viewer.open(path, context)
  return false
}

const resolveLocalPath = ({ href, currentFile, projectRoot, target }) => {
  const pathApi = target.path
  if (!pathApi || !currentFile?.pathname || !projectRoot?.pathname) return null
  const source = decodeURI(String(href || '').trim()).replace(FILE_SCHEME, '')
  if (!source || source.startsWith('#')) return null
  const absolutePath = pathApi.isAbsolute(source)
    ? pathApi.normalize(source)
    : pathApi.resolve(pathApi.dirname(currentFile.pathname), source)
  const root = pathApi.normalize(projectRoot.pathname)
  const insideVault = absolutePath === root || target.fileUtils?.isChildOfDirectory?.(root, absolutePath) === true
  return insideVault ? absolutePath : null
}

export const routeEditorLink = async ({ href, currentFile, projectRoot, target = globalThis }) => {
  const source = String(href || '').trim()
  if (!source || source.startsWith('#')) return { handled: false, route: 'ignored' }

  if (EXTERNAL_SCHEME.test(source)) {
    await target.__TAURI__?.core?.invoke('plugin:opener|open_url', { url: source })
    return recordOpen({ handled: true, route: 'system-url', source }, target)
  }

  const absolutePath = resolveLocalPath({ href: source, currentFile, projectRoot, target })
  if (!absolutePath) return recordOpen({ handled: false, route: 'rejected', source }, target)

  if (PDF_EXTENSION.test(absolutePath)) {
    const viewer = target.__ELEPHANT_ADDON_HOST__?.get?.('pdf.viewer')
    if (viewer) {
      const result = await invokePdfViewer(viewer, absolutePath, { href: source, currentFile, projectRoot })
      if (result !== false) {
        return recordOpen({ handled: true, route: 'pdf-addon', source, path: absolutePath }, target)
      }
    }
  }

  let error = null
  try {
    await target.__TAURI__?.core?.invoke('plugin:opener|open_path', { path: absolutePath })
  } catch (reason) {
    error = reason?.message || String(reason)
  }
  return recordOpen({ handled: true, route: 'system-path', source, path: absolutePath, error }, target)
}

export const createRuntimeLinkHandler = ({ currentFile, projectTree, target = globalThis }) => async (event) => {
  const anchor = event?.target?.closest?.('a[href]')
  if (!anchor) return false
  const href = anchor.getAttribute('href') || ''
  if (!href || href.startsWith('#')) return false
  event.preventDefault?.()
  event.stopPropagation?.()
  await routeEditorLink({
    href,
    currentFile: currentFile.value,
    projectRoot: projectTree.value,
    target
  })
  return true
}

export const readFileOpenHistory = (target = globalThis) => [...fileOpenHistory(target)]
export const clearFileOpenHistory = (target = globalThis) => {
  fileOpenHistory(target).splice(0)
}
