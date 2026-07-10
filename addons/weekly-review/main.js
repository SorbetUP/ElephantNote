const DAILY_ROOT = 'Daily'
const WEEKLY_ROOT = 'Periodic/Weekly'

const pad = (value) => String(value).padStart(2, '0')
const isoWeek = (date) => {
  const value = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = value.getUTCDay() || 7
  value.setUTCDate(value.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1))
  return {
    year: value.getUTCFullYear(),
    week: Math.ceil((((value - yearStart) / 86400000) + 1) / 7)
  }
}

const dateFromPath = (path) => {
  const match = String(path).match(/^Daily\/(\d{4}-\d{2}-\d{2})\.md$/)
  return match ? match[1] : null
}

const extract = (content, path) => {
  const open = []
  const completed = []
  const highlights = []
  let inFence = false
  for (const rawLine of String(content).split(/\r?\n/)) {
    const line = rawLine.trim()
    if (/^```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence || !line) continue
    const task = line.match(/^[-*+]\s+\[([ xX])\]\s+(.+)$/)
    if (task) {
      const item = { text: task[2].trim(), path }
      if (task[1].toLowerCase() === 'x') completed.push(item)
      else open.push(item)
      continue
    }
    if (/^[-*+]\s+/.test(line) && !/^[-*+]\s+\[/.test(line)) {
      highlights.push({ text: line.replace(/^[-*+]\s+/, '').trim(), path })
    }
  }
  return { open, completed, highlights: highlights.slice(0, 12) }
}

const link = (path, label) => `[[${path.replace(/\.md$/i, '')}|${label}]]`

self.elephantAddon = {
  activate(api) {
    return api.commands.register({
      id: 'com.elephantnote.weekly-review.generate',
      title: 'Generate weekly review',
      description: 'Summarize the seven most recent dated notes from Daily/.',
      async run(input = {}) {
        const limit = Math.max(1, Math.min(14, Number(input.days) || 7))
        const entries = (await api.notes.list(DAILY_ROOT))
          .map((entry) => ({ ...entry, date: dateFromPath(entry.path) }))
          .filter((entry) => entry.date)
          .sort((left, right) => right.date.localeCompare(left.date))
          .slice(0, limit)
          .reverse()

        const open = []
        const completed = []
        const highlights = []
        for (const entry of entries) {
          const note = await api.notes.read(entry.path)
          const extracted = extract(note.content, entry.path)
          open.push(...extracted.open)
          completed.push(...extracted.completed)
          highlights.push(...extracted.highlights)
        }

        const now = new Date()
        const week = isoWeek(now)
        const label = `${week.year}-W${pad(week.week)}`
        const path = `${WEEKLY_ROOT}/${label}.md`
        const lines = [
          '---',
          `title: ${JSON.stringify(`Weekly Review ${label}`)}`,
          'type: "weekly-review"',
          `generatedAt: ${JSON.stringify(now.toISOString())}`,
          `sourceNotes: ${entries.length}`,
          '---',
          '',
          `# Weekly Review ${label}`,
          '',
          `Generated from ${entries.length} daily note${entries.length === 1 ? '' : 's'}.`,
          '',
          '## Open tasks',
          ''
        ]

        if (open.length) {
          for (const item of open) lines.push(`- [ ] ${item.text} — ${link(item.path, dateFromPath(item.path))}`)
        } else lines.push('_No open tasks found._')

        lines.push('', '## Completed tasks', '')
        if (completed.length) {
          for (const item of completed) lines.push(`- [x] ${item.text} — ${link(item.path, dateFromPath(item.path))}`)
        } else lines.push('_No completed tasks found._')

        lines.push('', '## Highlights', '')
        if (highlights.length) {
          for (const item of highlights.slice(0, 40)) lines.push(`- ${item.text} — ${link(item.path, dateFromPath(item.path))}`)
        } else lines.push('_No bullet highlights found._')

        lines.push('', '## Source notes', '')
        if (entries.length) {
          for (const entry of entries) lines.push(`- ${link(entry.path, entry.date)}`)
        } else lines.push('_No dated Daily notes were found._')
        lines.push('')

        await api.notes.write(path, lines.join('\n'))
        return {
          path,
          sourceNotes: entries.length,
          openTasks: open.length,
          completedTasks: completed.length,
          highlights: Math.min(highlights.length, 40)
        }
      }
    })
  }
}
