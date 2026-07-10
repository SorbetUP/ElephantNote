const MAX_NOTES = 50
const MAX_NOTE_BYTES = 256 * 1024

const titleFrom = (content, path) => {
  const frontmatterTitle = content.match(/^---[\s\S]*?^title:\s*["']?(.+?)["']?\s*$[\s\S]*?^---/m)?.[1]?.trim()
  if (frontmatterTitle) return frontmatterTitle
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim()
  if (heading) return heading
  return path.split('/').pop().replace(/\.md$/i, '')
}

const statusFrom = (content) => {
  const status = content.match(/^---[\s\S]*?^status:\s*["']?(.+?)["']?\s*$[\s\S]*?^---/m)?.[1]?.trim()
  return status || 'unknown'
}

const summaryFrom = (content) => {
  const withoutFrontmatter = content.replace(/^---[\s\S]*?^---\s*/m, '')
  const paragraph = withoutFrontmatter
    .split(/\n\s*\n/)
    .map((part) => part.replace(/^#{1,6}\s+.*$/gm, '').replace(/^[-*]\s+/gm, '').trim())
    .find((part) => part && !part.startsWith('```'))
  if (!paragraph) return 'No summary available.'
  return paragraph.replace(/\s+/g, ' ').slice(0, 220)
}

const uncheckedTasks = (content) => (content.match(/^\s*[-*]\s+\[ \]\s+/gm) || []).length

const formatDate = (milliseconds) => {
  if (!Number.isFinite(milliseconds)) return 'Unknown'
  return new Date(milliseconds).toISOString()
}

self.elephantAddon = {
  activate(api) {
    return api.commands.register({
      id: 'com.elephantnote.inbox-digest.generate',
      title: 'Generate inbox digest',
      description: 'Review Markdown notes under Inbox/ and write Reports/Inbox Digest.md.',
      async run() {
        const listed = await api.notes.list('Inbox')
        const selected = listed
          .filter((entry) => entry.size <= MAX_NOTE_BYTES)
          .sort((left, right) => (right.modifiedAt || 0) - (left.modifiedAt || 0) || left.path.localeCompare(right.path))
          .slice(0, MAX_NOTES)

        const notes = []
        for (const entry of selected) {
          try {
            const note = await api.notes.read(entry.path)
            notes.push({
              path: entry.path,
              size: entry.size,
              modifiedAt: entry.modifiedAt,
              title: titleFrom(note.content, entry.path),
              status: statusFrom(note.content),
              summary: summaryFrom(note.content),
              uncheckedTasks: uncheckedTasks(note.content)
            })
          } catch (error) {
            notes.push({
              path: entry.path,
              size: entry.size,
              modifiedAt: entry.modifiedAt,
              title: entry.path.split('/').pop().replace(/\.md$/i, ''),
              status: 'read-error',
              summary: error?.message || String(error),
              uncheckedTasks: 0
            })
          }
        }

        const generatedAt = new Date().toISOString()
        const path = 'Reports/Inbox Digest.md'
        const totalTasks = notes.reduce((sum, note) => sum + note.uncheckedTasks, 0)
        const statusCounts = notes.reduce((counts, note) => {
          counts[note.status] = (counts[note.status] || 0) + 1
          return counts
        }, {})

        const lines = [
          '---',
          'title: "Inbox Digest"',
          'type: "generated-report"',
          `generatedAt: ${JSON.stringify(generatedAt)}`,
          'tags: [inbox, digest, generated]',
          '---',
          '',
          '# Inbox Digest',
          '',
          `Generated: ${generatedAt}`,
          '',
          '## Summary',
          '',
          `- Inbox notes found: ${listed.length}`,
          `- Notes reviewed: ${notes.length}`,
          `- Notes skipped because they exceeded ${MAX_NOTE_BYTES / 1024} KiB: ${listed.filter((entry) => entry.size > MAX_NOTE_BYTES).length}`,
          `- Open tasks found: ${totalTasks}`,
          `- Statuses: ${Object.entries(statusCounts).map(([status, count]) => `${status} (${count})`).join(', ') || 'none'}`,
          '',
          '## Review queue',
          ''
        ]

        if (notes.length === 0) {
          lines.push('- Inbox is empty.')
        } else {
          for (const note of notes) {
            lines.push(`### [[${note.path.replace(/\.md$/i, '')}|${note.title.replaceAll('|', '\\|')}]]`)
            lines.push('')
            lines.push(`- **Status:** ${note.status}`)
            lines.push(`- **Modified:** ${formatDate(note.modifiedAt)}`)
            lines.push(`- **Open tasks:** ${note.uncheckedTasks}`)
            lines.push(`- **Summary:** ${note.summary}`)
            lines.push('')
          }
        }

        lines.push('## Suggested processing flow', '', '1. Clarify the next action.', '2. Link the note to an existing topic or wiki.', '3. Move it out of Inbox/ when processed.', '')

        await api.notes.write(path, lines.join('\n'))
        await api.storage.set('lastRun', {
          generatedAt,
          listed: listed.length,
          reviewed: notes.length,
          openTasks: totalTasks
        })

        return {
          path,
          generatedAt,
          listed: listed.length,
          reviewed: notes.length,
          openTasks: totalTasks
        }
      }
    })
  }
}
