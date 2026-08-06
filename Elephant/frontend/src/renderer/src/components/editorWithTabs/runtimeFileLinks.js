const PDF_EXTENSION = /\.pdf(?:[?#].*)?$/i
const IMAGE_MIME = /^image\//i
const IMAGE_EXTENSION = /\.(?:png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i
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

const isImageFile = (file) => IMAGE_MIME.test(String(file?.type || '')) || IMAGE_EXTENSION.test(String(file?.name || ''))

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
    } catch (error) {
      console.warn('[elephantnote:file-drop] native copy failed; using browser bytes', {
        name: file?.name || '',
        nativePath,
        destination,
        error: error?.message || String(error)
      })
    }
  }
  if (!copied) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!bytes.byteLength) throw new Error(`Dropped file ${file?.name || '<unnamed>'} is empty.`)
    await fileUtils.writeFile(destination, bytes, 'binary')
  }

  const relativePath = pathApi.relative(pathApi.dirname(currentFile.pathname), destination).replace(/\\/g, '/')
  const encodedPath = encodeMarkdownPath(relativePath)
  const label = escapeLabel(file?.name)
  const image = isImageFile(file)
  const markdown = image
    ? `![${label}](${encodedPath})`
    : `[${label}](${encodedPath})`

  console.info('[elephantnote:file-drop] attachment persisted', {
    name: file?.name || '',
    type: file?.type || '',
    image,
    destination,
    relativePath,
    markdown
  })

  return {
    absolutePath: destination,
    relativePath,
    image,
    markdown
  }
}

export const createRuntimeFileHandlers = ({
  currentFile,
  projectTree,
  dispatch,
  target = globalThis
}) => ({
  dropped: async (files) => {
    const list = Array.from(files || [])
    if (!list.length) return false

    const attachments = []
    for (const file of list) {
      attachments.push(await storeDroppedAttachment({
        file,
        currentFile: currentFile.value,
        projectRoot: projectTree.value,
        target
      }))
    }

    const markdown = attachments.map((attachment) => attachment.markdown).join('\n')
    const result = await dispatch('paste-markdown', markdown)
    if (!result) throw new Error('Rust editor rejected the dropped attachment Markdown.')
    console.info('[elephantnote:file-drop] canonical Markdown inserted', {
      attachmentCount: attachments.length,
      markdownLength: markdown.length
    })
    return attachments.length === 1 ? attachments[0] : attachments
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
