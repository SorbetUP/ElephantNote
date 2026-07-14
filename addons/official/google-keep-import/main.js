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
