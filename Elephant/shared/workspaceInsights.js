export const isNoteEntry = (entry) => (entry?.kind || entry?.type) === 'note'

export const isFolderEntry = (entry) => (entry?.kind || entry?.type) === 'folder'

const toTime = (value) => {
  const time = Date.parse(value || '')
  return Number.isFinite(time) ? time : 0
}

const byNewestUpdated = (a, b) => toTime(b.updatedAt) - toTime(a.updatedAt)

const splitWorkspaceEntries = (entries = []) => {
  const notes = []
  const folders = []
  for (const entry of entries || []) {
    if (isNoteEntry(entry)) notes.push(entry)
    else if (isFolderEntry(entry)) folders.push(entry)
  }
  return { notes, folders }
}

export const createRecentNoteEntries = ({
  entries = [],
  openedNotes = [],
  pinnedNotePaths = [],
  limit = 8
} = {}) => {
  const byPath = new Map()
  for (const note of openedNotes) {
    if (note?.path && !byPath.has(note.path)) byPath.set(note.path, note)
  }

  const modified = entries
    .filter(isNoteEntry)
    .sort(byNewestUpdated)
  for (const note of modified) {
    if (note?.path && !byPath.has(note.path)) byPath.set(note.path, note)
  }

  const pinned = new Set(pinnedNotePaths)
  return [...byPath.values()]
    .sort((a, b) => {
      const aPinned = pinned.has(a.path)
      const bPinned = pinned.has(b.path)
      if (aPinned !== bPinned) return aPinned ? -1 : 1
      return byNewestUpdated(a, b)
    })
    .slice(0, limit)
}

export const createTagTopics = (entries = []) => {
  const byTag = new Map()
  for (const note of entries) {
    if (!isNoteEntry(note)) continue
    const noteUpdatedAt = note.updatedAt || ''
    const noteUpdatedTime = toTime(noteUpdatedAt)
    for (const tag of note.tags || []) {
      if (!tag) continue
      const topic = byTag.get(tag) || {
        tag,
        notes: [],
        updatedAt: noteUpdatedAt,
        updatedTime: noteUpdatedTime
      }
      topic.notes.push(note)
      if (noteUpdatedTime > topic.updatedTime) {
        topic.updatedAt = noteUpdatedAt
        topic.updatedTime = noteUpdatedTime
      }
      byTag.set(tag, topic)
    }
  }
  return [...byTag.values()]
    .sort((a, b) => {
      if (b.notes.length !== a.notes.length) return b.notes.length - a.notes.length
      return a.tag.localeCompare(b.tag)
    })
    .map(({ updatedTime, ...topic }) => topic)
}

export const createWorkspaceStats = ({
  entries = [],
  recentNoteEntries = []
} = {}) => {
  let notes = 0
  let folders = 0
  const tags = new Set()

  for (const entry of entries) {
    if (isNoteEntry(entry)) {
      notes += 1
      for (const tag of entry.tags || []) {
        if (tag) tags.add(tag)
      }
    } else if (isFolderEntry(entry)) {
      folders += 1
    }
  }

  return {
    notes,
    folders,
    tags: tags.size,
    recent: recentNoteEntries.length
  }
}

export const createCalendarBuckets = (entries = []) => {
  const buckets = new Map()
  for (const note of entries) {
    if (!isNoteEntry(note)) continue
    const day = String(note.updatedAt || '').slice(0, 10) || 'No date'
    const bucket = buckets.get(day) || []
    bucket.push(note)
    buckets.set(day, bucket)
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, notes]) => ({
      date,
      notes: notes.sort(byNewestUpdated)
    }))
}

export const createGraphModel = ({
  entries = [],
  tagTopics = createTagTopics(entries)
} = {}) => {
  const { notes, folders } = splitWorkspaceEntries(entries)
  const folderPaths = new Set(folders.map((folder) => folder.path).filter(Boolean))
  const nodes = [
    ...folders.map((folder) => ({
      id: folder.path,
      title: folder.title,
      kind: 'folder'
    })),
    ...notes.map((note) => ({
      id: note.path,
      title: note.title,
      kind: 'note'
    }))
  ]
  const edges = []
  for (const note of notes) {
    const folderPath = note.path?.includes('/') ? note.path.split('/').slice(0, -1).join('/') : ''
    if (folderPath && folderPaths.has(folderPath)) {
      edges.push({ source: folderPath, target: note.path, reason: 'folder' })
    }
  }
  for (const topic of tagTopics) {
    const taggedNotes = topic.notes
    for (let index = 1; index < taggedNotes.length; index += 1) {
      edges.push({
        source: taggedNotes[0].path,
        target: taggedNotes[index].path,
        reason: `#${topic.tag}`
      })
    }
  }
  return { nodes, edges }
}
