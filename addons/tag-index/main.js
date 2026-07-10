const REPORT_PATH = 'Reports/Tag Index.md'

const parseFrontmatterTags = (markdown) => {
  const tags = []
  const match = String(markdown).match(/^---\s*\n([\s\S]*?)\n---(?:\n|$)/)
  if (!match) return tags
  const lines = match[1].split(/\r?\n/)
  let collecting = false
  for (const raw of lines) {
    const line = raw.trim()
    const direct = line.match(/^tags?\s*:\s*(.*)$/i)
    if (direct) {
      collecting = direct[1].trim() === ''
      const value = direct[1].trim()
      if (value.startsWith('[') && value.endsWith(']')) {
        for (const item of value.slice(1, -1).split(',')) tags.push(item.trim().replace(/^['"]|['"]$/g, ''))
      } else if (value) {
        for (const item of value.split(/[ ,]+/)) tags.push(item.trim().replace(/^['"]|['"]$/g, ''))
      }
      continue
    }
    if (collecting) {
      const item = line.match(/^[-*]\s+(.+)$/)
      if (item) tags.push(item[1].trim().replace(/^['"]|['"]$/g, ''))
      else if (line && !/^\s/.test(raw)) collecting = false
    }
  }
  return tags.filter(Boolean)
}

const parseInlineTags = (markdown) => {
  const tags = []
  let inFence = false
  for (const raw of String(markdown).split(/\r?\n/)) {
    const trimmed = raw.trim()
    if (/^```/.test(trimmed)) {
      inFence = !inFence
      continue
    }
    if (inFence || /^#{1,6}\s/.test(trimmed)) continue
    const line = raw.replace(/`[^`]*`/g, ' ')
    const regex = /(^|[\s([{>])#([\p{L}\p{N}_/-]+)/gu
    let match
    while ((match = regex.exec(line))) tags.push(match[2])
  }
  return tags
}

const normalize = (tag) => String(tag || '')
  .trim()
  .replace(/^#+/, '')
  .replace(/\/+$/g, '')
  .toLocaleLowerCase()

const noteLink = (path) => `[[${path.replace(/\.md$/i, '')}|${path.split('/').pop().replace(/\.md$/i, '')}]]`

self.elephantAddon = {
  activate(api) {
    return api.commands.register({
      id: 'com.elephantnote.tag-index.generate',
      title: 'Generate tag index',
      description: 'Index frontmatter and inline tags and report spelling/case collisions.',
      async run() {
        const entries = (await api.notes.list('.')).filter((entry) => entry.path !== REPORT_PATH)
        const index = new Map()
        let failed = 0

        for (const entry of entries) {
          try {
            const note = await api.notes.read(entry.path)
            const tags = [...parseFrontmatterTags(note.content), ...parseInlineTags(note.content)]
            for (const original of tags) {
              const key = normalize(original)
              if (!key) continue
              if (!index.has(key)) index.set(key, { variants: new Set(), notes: new Set(), occurrences: 0 })
              const record = index.get(key)
              record.variants.add(String(original).replace(/^#+/, ''))
              record.notes.add(entry.path)
              record.occurrences += 1
            }
          } catch {
            failed += 1
          }
        }

        const rows = [...index.entries()]
          .map(([tag, record]) => ({ tag, variants: [...record.variants].sort(), notes: [...record.notes].sort(), occurrences: record.occurrences }))
          .sort((left, right) => right.notes.length - left.notes.length || left.tag.localeCompare(right.tag))
        const collisions = rows.filter((row) => row.variants.length > 1)
        const generatedAt = new Date().toISOString()
        const lines = [
          '---',
          'title: "Tag Index"',
          'type: "generated-report"',
          `generatedAt: ${JSON.stringify(generatedAt)}`,
          '---',
          '',
          '# Tag Index',
          '',
          `- Notes analyzed: ${entries.length - failed}`,
          `- Unique normalized tags: ${rows.length}`,
          `- Case or spelling collisions: ${collisions.length}`,
          `- Notes that could not be read: ${failed}`,
          '',
          '## Tags',
          ''
        ]

        for (const row of rows) {
          lines.push(`### #${row.tag}`, '')
          lines.push(`- Notes: ${row.notes.length}`)
          lines.push(`- Occurrences: ${row.occurrences}`)
          if (row.variants.length > 1) lines.push(`- Variants: ${row.variants.map((value) => `\`${value}\``).join(', ')}`)
          lines.push('')
          for (const path of row.notes) lines.push(`- ${noteLink(path)}`)
          lines.push('')
        }
        if (!rows.length) lines.push('_No tags found._', '')

        lines.push('## Collisions to review', '')
        if (collisions.length) {
          for (const row of collisions) lines.push(`- #${row.tag}: ${row.variants.map((value) => `\`${value}\``).join(', ')}`)
        } else lines.push('_No collisions found._')
        lines.push('')

        await api.notes.write(REPORT_PATH, lines.join('\n'))
        return { path: REPORT_PATH, notes: entries.length - failed, tags: rows.length, collisions: collisions.length, failed }
      }
    })
  }
}
