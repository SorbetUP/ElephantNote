const ADDON_ID = 'elephant.google-keep-import'
const PROVIDER_RESOURCE = 'import.google-keep'
const DESTINATION = 'Imported/Google Keep'

const node = (documentRef, tag, className = '', text = '') => {
  const element = documentRef.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

const asString = (value) => typeof value === 'string' ? value : value == null ? '' : String(value)
const basename = (value = '') => asString(value).replaceAll('\\', '/').split('/').pop() || ''
const withoutExtension = (value = '') => basename(value).replace(/\.json$/i, '')

const timestampToIso = (value) => {
  if (value == null || value === '') return ''
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return ''
  const milliseconds = numeric > 10_000_000_000_000 ? numeric / 1000 : numeric
  const date = new Date(milliseconds)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

const yamlString = (value) => JSON.stringify(asString(value))
const isUnsafeFilenameCharacter = (character) => {
  const codePoint = character.codePointAt(0) ?? 0
  return codePoint <= 31 || '<>:"/\\|?*'.includes(character)
}

export const safeNoteStem = (value = '') => {
  const normalized = [...asString(value).normalize('NFKC')]
    .map((character) => isUnsafeFilenameCharacter(character) ? '-' : character)
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
  return (normalized || 'Untitled Keep note').slice(0, 120)
}

const normalizeLabels = (value) => (Array.isArray(value) ? value : [])
  .map((label) => asString(label?.name ?? label).trim())
  .filter(Boolean)

const normalizeList = (value) => (Array.isArray(value) ? value : [])
  .map((item) => ({
    text: asString(item?.text ?? item?.textContent).trim(),
    checked: item?.isChecked === true || item?.checked === true
  }))
  .filter((item) => item.text)

const normalizeAttachments = (value) => (Array.isArray(value) ? value : [])
  .map((attachment) => asString(
    attachment?.filePath || attachment?.fileName || attachment?.mimetype || attachment?.name
  ).trim())
  .filter(Boolean)

export const parseKeepDocument = (input, sourceName = '') => {
  const value = typeof input === 'string' ? JSON.parse(input) : input
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('A Google Keep note must be a JSON object')
  }

  const sourceStem = withoutExtension(sourceName)
  const title = asString(value.title).trim() || sourceStem || 'Untitled Keep note'
  const createdAt = timestampToIso(value.createdTimestampUsec ?? value.createdAt ?? value.created)
  const updatedAt = timestampToIso(value.userEditedTimestampUsec ?? value.updatedAt ?? value.updated)

  return {
    title,
    text: asString(value.textContent ?? value.text).trim(),
    list: normalizeList(value.listContent ?? value.listItems),
    labels: normalizeLabels(value.labels),
    attachments: normalizeAttachments(value.attachments),
    createdAt,
    updatedAt,
    pinned: value.isPinned === true,
    archived: value.isArchived === true,
    trashed: value.isTrashed === true,
    sourceName: basename(sourceName),
    sourceStem
  }
}

export const keepDocumentToMarkdown = (note) => {
  const frontmatter = [
    '---',
    'source: google-keep',
    `title: ${yamlString(note.title)}`,
    `pinned: ${Boolean(note.pinned)}`,
    `archived: ${Boolean(note.archived)}`,
    `trashed: ${Boolean(note.trashed)}`
  ]
  if (note.createdAt) frontmatter.push(`created: ${yamlString(note.createdAt)}`)
  if (note.updatedAt) frontmatter.push(`updated: ${yamlString(note.updatedAt)}`)
  if (note.sourceName) frontmatter.push(`source_file: ${yamlString(note.sourceName)}`)
  if (note.labels.length) frontmatter.push(`tags: [${note.labels.map(yamlString).join(', ')}]`)
  frontmatter.push('---')

  const body = [`# ${note.title}`]
  if (note.text) body.push(note.text)
  if (note.list.length) {
    body.push(note.list.map((item) => `- [${item.checked ? 'x' : ' '}] ${item.text}`).join('\n'))
  }
  if (note.attachments.length) {
    body.push('## Attachments', note.attachments.map((attachment) => `- ${attachment}`).join('\n'))
  }
  return `${frontmatter.join('\n')}\n\n${body.join('\n\n')}\n`
}

const createUniquePath = (note, occupied) => {
  const stem = safeNoteStem(note.title || note.sourceStem)
  let index = 1
  let relativePath = `${DESTINATION}/${stem}.md`
  while (occupied.has(relativePath.toLowerCase())) {
    index += 1
    relativePath = `${DESTINATION}/${stem} ${index}.md`
  }
  occupied.add(relativePath.toLowerCase())
  return relativePath
}

export default class ElephantGoogleKeepImportAddon {
  constructor(api) {
    this.api = api
    this.window = api.experimental.window
  }

  invoke(command, payload = {}) {
    const invoke = this.window?.__TAURI__?.core?.invoke
    if (typeof invoke !== 'function') throw new Error(`Tauri command API is unavailable for ${command}`)
    return invoke(command, payload)
  }

  writeNote(path, markdown, overwrite = false) {
    return this.invoke('tauri_addons_notes_write', {
      addonId: ADDON_ID,
      path,
      markdown,
      overwrite
    })
  }

  async importDocuments(documents, options = {}) {
    if (!Array.isArray(documents)) throw new TypeError('Google Keep import expects an array of JSON documents')
    const occupied = new Set()
    const results = []
    for (const item of documents) {
      try {
        const sourceName = asString(item?.name ?? item?.sourceName)
        const raw = item?.content ?? item?.json ?? item
        const note = parseKeepDocument(raw, sourceName)
        if (note.trashed && options.includeTrashed !== true) {
          results.push({ sourceName, skipped: true, reason: 'trashed' })
          continue
        }
        const path = createUniquePath(note, occupied)
        const result = await this.writeNote(path, keepDocumentToMarkdown(note), false)
        results.push({ sourceName, path, created: result?.created !== false })
      } catch (error) {
        results.push({
          sourceName: asString(item?.name ?? item?.sourceName),
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
    return {
      imported: results.filter((result) => result.path).length,
      skipped: results.filter((result) => result.skipped).length,
      failed: results.filter((result) => result.error).length,
      results
    }
  }

  async importFiles(files, options = {}) {
    const documents = []
    for (const file of Array.from(files || [])) {
      documents.push({ name: file.name, content: await file.text() })
    }
    return this.importDocuments(documents, options)
  }

  render(container) {
    const documentRef = container.ownerDocument
    const root = node(documentRef, 'section', 'elephant-keep-import')
    const copy = node(documentRef, 'div', 'elephant-keep-copy')
    copy.append(
      node(documentRef, 'h3', '', 'Google Keep Import'),
      node(documentRef, 'p', '', `Import Google Takeout JSON notes into ${DESTINATION}.`)
    )
    const input = node(documentRef, 'input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.multiple = true
    const includeTrashedLabel = node(documentRef, 'label', 'elephant-keep-option')
    const includeTrashed = node(documentRef, 'input')
    includeTrashed.type = 'checkbox'
    includeTrashedLabel.append(includeTrashed, node(documentRef, 'span', '', 'Include trashed notes'))
    const button = node(documentRef, 'button', '', 'Import selected files')
    const status = node(documentRef, 'pre', 'elephant-keep-status', 'Choose one or more Google Keep JSON files.')
    button.disabled = true
    input.addEventListener('change', () => { button.disabled = !input.files?.length })
    button.addEventListener('click', async() => {
      button.disabled = true
      status.textContent = 'Importing…'
      try {
        const result = await this.importFiles(input.files, { includeTrashed: includeTrashed.checked })
        status.textContent = JSON.stringify(result, null, 2)
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error)
      } finally {
        button.disabled = !input.files?.length
      }
    })
    root.append(copy, input, includeTrashedLabel, button, status)
    container.replaceChildren(root)
    return () => root.remove()
  }

  async onload(api) {
    api.resources.provide(PROVIDER_RESOURCE, Object.freeze({
      parse: (input, sourceName = '') => parseKeepDocument(input, sourceName),
      toMarkdown: (input, sourceName = '') => keepDocumentToMarkdown(parseKeepDocument(input, sourceName)),
      importDocuments: (documents, options = {}) => this.importDocuments(documents, options),
      destination: DESTINATION
    }))

    api.commands.register({
      id: `${ADDON_ID}.import`,
      title: 'Import Google Keep Takeout',
      run: (documents = [], options = {}) => this.importDocuments(documents, options)
    })

    api.ui.registerStyle(`
      .elephant-keep-import { display:grid; gap:14px; max-width:760px; }
      .elephant-keep-copy h3,.elephant-keep-copy p { margin:0; }
      .elephant-keep-copy p { margin-top:5px; color:var(--en-muted); }
      .elephant-keep-import input[type=file] { padding:12px; border:1px dashed var(--en-border); border-radius:12px; background:var(--en-soft); color:var(--en-text); }
      .elephant-keep-option { display:flex; align-items:center; gap:8px; color:var(--en-muted); font-size:13px; }
      .elephant-keep-import button { justify-self:start; min-height:36px; padding:0 14px; border:1px solid var(--en-border); border-radius:9px; background:var(--en-surface); color:var(--en-text); cursor:pointer; }
      .elephant-keep-import button:disabled { opacity:.55; cursor:default; }
      .elephant-keep-status { min-height:80px; max-height:280px; overflow:auto; margin:0; padding:12px; border:1px solid var(--en-border); border-radius:12px; background:var(--en-soft); color:var(--en-muted); font-size:11px; white-space:pre-wrap; }
    `, 'google-keep-import-package')

    api.settings.registerSection({
      id: `${ADDON_ID}.settings`,
      section: 'import',
      navigationLabel: 'Import',
      navigationIcon: 'download',
      standalone: true,
      chrome: false,
      title: 'Import',
      description: 'Import notes from external applications.',
      order: 40,
      render: (container) => this.render(container)
    })
  }
}
