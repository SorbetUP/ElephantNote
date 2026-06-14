export const isNoteEntry = (entry) => (entry?.kind || entry?.type) === 'note'

export const isFolderEntry = (entry) => (entry?.kind || entry?.type) === 'folder'

const byNewestUpdated = (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)

export const createRecentNoteEntries = ({
  entries = [],
  openedNotes = [],
  pinnedNotePaths = [],
  limit = 8
} = {}) => {
  const opened = openedNotes.filter((note) => note?.path)
  const modified = entries
    .filter(isNoteEntry)
    .sort(byNewestUpdated)
  const byPath = new Map()
  for (const note of [...opened, ...modified]) {
    if (!byPath.has(note.path)) byPath.set(note.path, note)
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
  const notes = entries.filter(isNoteEntry)
  for (const note of notes) {
    for (const tag of note.tags || []) {
      if (!tag) continue
      const topic = byTag.get(tag) || {
        tag,
        notes: [],
        updatedAt: note.updatedAt || ''
      }
      topic.notes.push(note)
      if (new Date(note.updatedAt || 0) > new Date(topic.updatedAt || 0)) {
        topic.updatedAt = note.updatedAt
      }
      byTag.set(tag, topic)
    }
  }
  return [...byTag.values()].sort((a, b) => {
    if (b.notes.length !== a.notes.length) return b.notes.length - a.notes.length
    return a.tag.localeCompare(b.tag)
  })
}

export const createWorkspaceStats = ({
  entries = [],
  recentNoteEntries = []
} = {}) => {
  const notes = entries.filter(isNoteEntry)
  const folders = entries.filter(isFolderEntry)
  const tags = new Set()
  for (const note of notes) {
    for (const tag of note.tags || []) {
      if (tag) tags.add(tag)
    }
  }
  return {
    notes: notes.length,
    folders: folders.length,
    tags: tags.size,
    recent: recentNoteEntries.length
  }
}

export const createCalendarBuckets = (entries = []) => {
  const buckets = new Map()
  const notes = entries.filter(isNoteEntry)
  for (const note of notes) {
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
  const notes = entries.filter(isNoteEntry)
  const folders = entries.filter(isFolderEntry)
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
