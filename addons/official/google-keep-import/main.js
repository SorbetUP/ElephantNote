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

export const safeNoteStem = (value = '') => {
  const normalized = asString(value)
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
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
  const labels = Array.isArray(note.labels) ? note.labels : []
  const frontmatter = [
    '---',
    `title: ${yamlString(note.title)}`,
    'source: google-keep',
    note.sourceName ? `sourceFile: ${yamlString(note.sourceName)}` : '',
    note.createdAt ? `created: ${yamlString(note.createdAt)}` : '',
    note.updatedAt ? `updated: ${yamlString(note.updatedAt)}` : '',
    `pinned: ${note.pinned === true}`,
    `archived: ${note.archived === true}`,
    `trashed: ${note.trashed === true}`,
    labels.length ? 'labels:' : '',
    ...labels.map((label) => `  - ${yamlString(label)}`),
    '---'
  ].filter(Boolean)

  const sections = [frontmatter.join('\n'), `# ${note.title}`]
  if (note.text) sections.push(note.text)
  if (note.list?.length) {
    sections.push(note.list.map((item) => `- [${item.checked ? 'x' : ' '}] ${item.text}`).join('\n'))
  }
  if (note.attachments?.length) {
    sections.push(['## Attachments', ...note.attachments.map((attachment) => `- ${attachment}`)].join('\n'))
  }
  if (!note.text && !note.list?.length && !note.attachments?.length) sections.push('_Empty Google Keep note._')
  return `${sections.join('\n\n').trim()}\n`
}

const datedStem = (note) => {
  const timestamp = note.updatedAt || note.createdAt
  const prefix = timestamp ? timestamp.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z') : ''
  const identity = note.sourceStem && note.sourceStem !== note.title
    ? `${note.title} - ${note.sourceStem}`
    : note.title
  return safeNoteStem([prefix, identity].filter(Boolean).join(' - '))
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

  async writeNote(note) {
    const markdown = keepDocumentToMarkdown(note)
    const stem = datedStem(note)
    let attempt = 1
    while (attempt <= 100) {
      const suffix = attempt === 1 ? '' : `-${attempt}`
      const path = `${DESTINATION}/${stem}${suffix}.md`
      try {
        const result = await this.invoke('tauri_addons_notes_write', {
          addonId: ADDON_ID,
          path,
          markdown,
          overwrite: false
        })
        return { ...result, title: note.title }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!/already exists/i.test(message)) throw error
        attempt += 1
      }
    }
    throw new Error(`Could not allocate a unique Markdown filename for ${note.title}`)
  }

  async importFiles(files) {
    const inputs = Array.from(files || []).filter((file) => /\.json$/i.test(asString(file?.name)))
    if (!inputs.length) throw new Error('Select one or more Google Keep Takeout JSON files')

    const imported = []
    const failures = []
    for (const file of inputs) {
      try {
        const note = parseKeepDocument(await file.text(), file.name)
        imported.push(await this.writeNote(note))
      } catch (error) {
        failures.push({
          file: asString(file?.name) || 'unknown.json',
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    const result = {
      selected: inputs.length,
      imported: imported.length,
      failed: failures.length,
      notes: imported,
      failures,
      destination: DESTINATION
    }
    this.api.app.emit('elephantnote:google-keep-import-complete', result)
    return result
  }

  render(container) {
    const documentRef = container.ownerDocument
    const root = node(documentRef, 'section', 'elephant-import-package')
    const status = node(documentRef, 'pre', 'elephant-import-status')
    const description = node(
      documentRef,
      'p',
      'elephant-import-description',
      'Select the JSON files from a Google Keep Takeout export. Notes are converted locally and written only under Imported/Google Keep.'
    )
    const picker = node(documentRef, 'input', 'elephant-import-picker')
    picker.type = 'file'
    picker.accept = '.json,application/json'
    picker.multiple = true
    picker.setAttribute('webkitdirectory', '')
    picker.setAttribute('directory', '')

    const actions = node(documentRef, 'div', 'elephant-import-actions')
    const importButton = node(documentRef, 'button', 'elephant-primary-button', 'Import selected notes')
    importButton.type = 'button'
    importButton.disabled = true
    const clearButton = node(documentRef, 'button', '', 'Clear')
    clearButton.type = 'button'

    const updateSelection = () => {
      const count = Array.from(picker.files || []).filter((file) => /\.json$/i.test(file.name)).length
      importButton.disabled = count === 0
      status.textContent = count ? `${count} JSON file${count === 1 ? '' : 's'} selected.` : ''
    }

    const runImport = async () => {
      importButton.disabled = true
      clearButton.disabled = true
      status.textContent = 'Importing Google Keep notes…'
      try {
        const result = await this.importFiles(picker.files)
        const lines = [`Imported ${result.imported}/${result.selected} notes into ${result.destination}.`]
        for (const failure of result.failures) lines.push(`${failure.file}: ${failure.error}`)
        status.textContent = lines.join('\n')
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error)
      } finally {
        clearButton.disabled = false
        updateSelection()
      }
    }

    const clear = () => {
      picker.value = ''
      status.textContent = ''
      updateSelection()
    }

    picker.addEventListener('change', updateSelection)
    importButton.addEventListener('click', runImport)
    clearButton.addEventListener('click', clear)
    actions.append(importButton, clearButton)
    root.append(node(documentRef, 'h3', '', 'Google Keep Import'), description, picker, actions, status)
    container.replaceChildren(root)

    return () => {
      picker.removeEventListener('change', updateSelection)
      importButton.removeEventListener('click', runImport)
      clearButton.removeEventListener('click', clear)
      root.remove()
    }
  }

  onload(api) {
    api.ui.registerStyle(`
      .elephant-import-package { display:grid; gap:14px; }
      .elephant-import-package h3,.elephant-import-description,.elephant-import-status { margin:0; }
      .elephant-import-description,.elephant-import-status { color:var(--en-muted); font-size:12px; }
      .elephant-import-picker { width:100%; box-sizing:border-box; padding:12px; border:1px dashed var(--en-border); border-radius:10px; background:var(--en-surface); color:var(--en-text); }
      .elephant-import-actions { display:flex; gap:8px; }
      .elephant-import-actions button { min-height:34px; padding:0 12px; border:1px solid var(--en-border); border-radius:9px; background:var(--en-surface); color:var(--en-text); cursor:pointer; }
      .elephant-primary-button { background:var(--en-primary); border-color:var(--en-primary); color:white; }
      .elephant-import-status { min-height:18px; white-space:pre-wrap; }
    `, 'google-keep-import-package')

    api.resources.provide(PROVIDER_RESOURCE, Object.freeze({
      destination: DESTINATION,
      parse: (value, sourceName) => parseKeepDocument(value, sourceName),
      toMarkdown: (note) => keepDocumentToMarkdown(note),
      importFiles: (files) => this.importFiles(files)
    }))

    api.commands.register({
      id: `${ADDON_ID}.open-import`,
      title: 'Import Google Keep Takeout',
      run: () => api.app.openSettings('import')
    })

    api.settings.registerSection({
      id: `${ADDON_ID}.settings`,
      section: 'import',
      navigationLabel: 'Import',
      navigationIcon: 'download',
      standalone: true,
      chrome: false,
      title: 'Google Keep Import',
      description: 'Convert Google Keep Takeout JSON files into local Markdown notes.',
      order: 20,
      render: (container) => this.render(container)
    })
  }
}
