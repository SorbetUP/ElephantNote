const normalizeTag = (tag = '') =>
  String(tag || '')
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, ' ')

const slugifyTopic = (topic = '') =>
  normalizeTag(topic)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'topic'

export const createWikiProposalId = (topic = '') => `wiki-${slugifyTopic(topic)}`

export const normalizeWikiRecord = (record = {}) => {
  const topic = normalizeTag(record.topic || record.tag || '')
  return {
    id: String(record.id || createWikiProposalId(topic)).trim(),
    topic,
    title: String(record.title || topic || 'Untitled topic').trim(),
    summary: String(record.summary || '').trim(),
    citations: Array.isArray(record.citations)
      ? record.citations
        .filter((citation) => citation?.path)
        .map((citation) => ({
          path: String(citation.path),
          title: String(citation.title || citation.path),
          excerpt: String(citation.excerpt || '').trim(),
          updatedAt: String(citation.updatedAt || '')
        }))
      : [],
    status: ['proposed', 'accepted', 'dismissed'].includes(record.status) ? record.status : 'proposed',
    createdAt: String(record.createdAt || ''),
    updatedAt: String(record.updatedAt || record.createdAt || ''),
    notePath: String(record.notePath || '')
  }
}

export const createWikiMarkdown = (proposal = {}, now = new Date()) => {
  const record = normalizeWikiRecord({
    ...proposal,
    updatedAt: proposal.updatedAt || now.toISOString()
  })
  const citations = record.citations
    .map((citation) => `- [[${citation.path}]]${citation.excerpt ? ` - ${citation.excerpt}` : ''}`)
    .join('\n')

  return `---
title: "${record.title.replace(/"/g, '\\"')}"
type: "wiki"
tags: ["wiki", "${record.topic.replace(/"/g, '\\"')}"]
createdAt: "${record.createdAt || now.toISOString()}"
updatedAt: "${now.toISOString()}"
---

# ${record.title}

${record.summary}

## Citations

${citations || '- No citations yet.'}
`
}

export const generateWikiProposals = (entries = [], now = new Date()) => {
  const topics = new Map()
  for (const entry of entries) {
    if ((entry.kind || entry.type) !== 'note') continue
    for (const rawTag of entry.tags || []) {
      const topicName = normalizeTag(rawTag)
      if (!topicName) continue
      const topic = topics.get(topicName) || []
      topic.push(entry)
      topics.set(topicName, topic)
    }
  }

  return [...topics.entries()]
    .filter(([, notes]) => notes.length > 0)
    .map(([topic, notes]) => {
      const sortedNotes = [...notes].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
      const citations = sortedNotes.slice(0, 8).map((note) => ({
        path: note.path,
        title: note.title || note.path,
        excerpt: note.excerpt || '',
        updatedAt: note.updatedAt || ''
      }))
      const leadTitles = citations.slice(0, 3).map((citation) => citation.title).join(', ')
      return normalizeWikiRecord({
        id: createWikiProposalId(topic),
        topic,
        title: topic,
        summary: `This local wiki proposal connects ${notes.length} note${notes.length === 1 ? '' : 's'} about #${topic}${leadTitles ? `, led by ${leadTitles}` : ''}.`,
        citations,
        status: 'proposed',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      })
    })
    .sort((a, b) => {
      if (b.citations.length !== a.citations.length) return b.citations.length - a.citations.length
      return a.topic.localeCompare(b.topic)
    })
}

export const mergeWikiProposals = (existingRecords = [], generatedRecords = [], now = new Date()) => {
  const existingById = new Map(existingRecords.map((record) => [record.id, normalizeWikiRecord(record)]))
  const merged = []

  for (const generated of generatedRecords.map(normalizeWikiRecord)) {
    const current = existingById.get(generated.id)
    if (current?.status === 'accepted' || current?.status === 'dismissed') {
      merged.push(current)
      existingById.delete(generated.id)
      continue
    }
    merged.push(normalizeWikiRecord({
      ...generated,
      createdAt: current?.createdAt || generated.createdAt || now.toISOString(),
      updatedAt: now.toISOString()
    }))
    existingById.delete(generated.id)
  }

  return [
    ...merged,
    ...[...existingById.values()].filter((record) => record.status === 'accepted' || record.status === 'dismissed')
  ].sort((a, b) => {
    const statusRank = { proposed: 0, accepted: 1, dismissed: 2 }
    if (statusRank[a.status] !== statusRank[b.status]) return statusRank[a.status] - statusRank[b.status]
    if (b.citations.length !== a.citations.length) return b.citations.length - a.citations.length
    return a.topic.localeCompare(b.topic)
  })
}
