const REPORT_PATH = 'Reports/Writing Statistics.md'

const stripNonProse = (markdown) => String(markdown)
  .replace(/^---\s*[\s\S]*?^---\s*$/m, ' ')
  .replace(/```[\s\S]*?```/g, ' ')
  .replace(/`[^`]*`/g, ' ')
  .replace(/!?(\[[^\]]*\])\([^)]*\)/g, '$1')
  .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1')
  .replace(/\[\[([^\]]+)\]\]/g, '$1')
  .replace(/<[^>]+>/g, ' ')

const countWords = (markdown) => {
  const matches = stripNonProse(markdown).match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu)
  return matches ? matches.length : 0
}

const noteLink = (path) => `[[${path.replace(/\.md$/i, '')}|${path.split('/').pop().replace(/\.md$/i, '')}]]`
const signed = (value) => value > 0 ? `+${value}` : String(value)

self.elephantAddon = {
  activate(api) {
    return api.commands.register({
      id: 'com.elephantnote.writing-statistics.generate',
      title: 'Generate writing statistics',
      description: 'Measure words, characters, estimated reading time and recent writing activity.',
      async run() {
        const entries = (await api.notes.list('.'))
          .filter((entry) => entry.path !== REPORT_PATH)
        const rows = []
        let totalWords = 0
        let totalCharacters = 0
        let failed = 0

        for (const entry of entries) {
          try {
            const note = await api.notes.read(entry.path)
            const words = countWords(note.content)
            const characters = [...String(note.content)].length
            rows.push({ ...entry, words, characters })
            totalWords += words
            totalCharacters += characters
          } catch {
            failed += 1
          }
        }

        rows.sort((left, right) => right.words - left.words || left.path.localeCompare(right.path))
        const activity = new Map()
        for (const row of rows) {
          if (!row.modifiedAt) continue
          const date = new Date(row.modifiedAt).toISOString().slice(0, 10)
          activity.set(date, (activity.get(date) || 0) + 1)
        }

        const previous = await api.storage.get('lastSummary')
        const summary = {
          generatedAt: new Date().toISOString(),
          notes: rows.length,
          words: totalWords,
          characters: totalCharacters
        }
        await api.storage.set('lastSummary', summary)

        const readingMinutes = Math.ceil(totalWords / 200)
        const lines = [
          '---',
          'title: "Writing Statistics"',
          'type: "generated-report"',
          `generatedAt: ${JSON.stringify(summary.generatedAt)}`,
          '---',
          '',
          '# Writing Statistics',
          '',
          `- Notes analyzed: ${rows.length}`,
          `- Words: ${totalWords.toLocaleString()}`,
          `- Characters: ${totalCharacters.toLocaleString()}`,
          `- Estimated reading time: ${readingMinutes.toLocaleString()} minute${readingMinutes === 1 ? '' : 's'}`,
          `- Notes that could not be read: ${failed}`
        ]

        if (previous && typeof previous === 'object') {
          lines.push(
            `- Change since previous run: ${signed(totalWords - Number(previous.words || 0))} words, ${signed(rows.length - Number(previous.notes || 0))} notes`
          )
        }

        lines.push('', '## Largest notes', '', '| Note | Words | Characters |', '| --- | ---: | ---: |')
        for (const row of rows.slice(0, 20)) {
          lines.push(`| ${noteLink(row.path)} | ${row.words.toLocaleString()} | ${row.characters.toLocaleString()} |`)
        }
        if (!rows.length) lines.push('| _No notes found_ | 0 | 0 |')

        lines.push('', '## Recently modified days', '', '| Date | Notes modified |', '| --- | ---: |')
        const recent = [...activity.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14)
        for (const [date, count] of recent) lines.push(`| ${date} | ${count} |`)
        if (!recent.length) lines.push('| _No modification timestamps available_ | 0 |')
        lines.push('')

        await api.notes.write(REPORT_PATH, lines.join('\n'))
        return { path: REPORT_PATH, notes: rows.length, words: totalWords, characters: totalCharacters, failed }
      }
    })
  }
}
