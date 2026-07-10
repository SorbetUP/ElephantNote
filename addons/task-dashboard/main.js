const taskPattern = /^\s*[-*+]\s+\[([ xX])\]\s+(.+?)\s*$/

const noteTitle = (path, content) => {
  const heading = String(content || '').split(/\r?\n/).find((line) => /^#\s+\S/.test(line.trim()))
  if (heading) return heading.trim().replace(/^#\s+/, '')
  return String(path || '').split('/').pop().replace(/\.md$/i, '') || 'Untitled'
}

const wikiLink = (path, label) => `[[${String(path).replace(/\.md$/i, '')}|${String(label).replaceAll('|', '\\|')}]]`

self.elephantAddon = {
  activate(api) {
    return api.commands.register({
      id: 'com.elephantnote.task-dashboard.generate',
      title: 'Generate task dashboard',
      description: 'Scan Markdown notes and write Reports/Task Dashboard.md.',
      async run() {
        const listed = await api.notes.list('.')
        const notes = Array.isArray(listed) ? listed.slice(0, 1000) : []
        const sources = []
        let openCount = 0
        let completedCount = 0

        for (const entry of notes) {
          if (entry.path === 'Reports/Task Dashboard.md') continue
          const note = await api.notes.read(entry.path)
          const tasks = []
          for (const [index, line] of String(note.content || '').split(/\r?\n/).entries()) {
            const match = line.match(taskPattern)
            if (!match) continue
            const completed = match[1].toLowerCase() === 'x'
            tasks.push({ completed, text: match[2], line: index + 1 })
            if (completed) completedCount += 1
            else openCount += 1
          }
          if (tasks.length) {
            sources.push({
              path: entry.path,
              title: noteTitle(entry.path, note.content),
              modifiedAt: entry.modifiedAt || null,
              tasks
            })
          }
        }

        sources.sort((left, right) => {
          const leftOpen = left.tasks.filter((task) => !task.completed).length
          const rightOpen = right.tasks.filter((task) => !task.completed).length
          return rightOpen - leftOpen || left.path.localeCompare(right.path)
        })

        const generatedAt = new Date().toISOString()
        const lines = [
          '---',
          'title: "Task Dashboard"',
          'type: "generated-report"',
          'tags: [tasks, dashboard]',
          `generatedAt: ${JSON.stringify(generatedAt)}`,
          '---',
          '',
          '# Task Dashboard',
          '',
          `Generated: ${generatedAt}`,
          '',
          '## Summary',
          '',
          `- Open tasks: ${openCount}`,
          `- Completed tasks: ${completedCount}`,
          `- Notes containing tasks: ${sources.length}`,
          '',
          '## Open tasks',
          ''
        ]

        const openSources = sources.filter((source) => source.tasks.some((task) => !task.completed))
        if (!openSources.length) {
          lines.push('- No open tasks found.')
        } else {
          for (const source of openSources) {
            lines.push(`### ${wikiLink(source.path, source.title)}`, '')
            for (const task of source.tasks.filter((task) => !task.completed)) {
              lines.push(`- [ ] ${task.text} _(line ${task.line})_`)
            }
            lines.push('')
          }
        }

        lines.push('## Completed tasks', '')
        const completedSources = sources.filter((source) => source.tasks.some((task) => task.completed))
        if (!completedSources.length) {
          lines.push('- No completed tasks found.')
        } else {
          for (const source of completedSources) {
            lines.push(`### ${wikiLink(source.path, source.title)}`, '')
            for (const task of source.tasks.filter((task) => task.completed).slice(0, 50)) {
              lines.push(`- [x] ${task.text} _(line ${task.line})_`)
            }
            lines.push('')
          }
        }

        const path = 'Reports/Task Dashboard.md'
        await api.notes.write(path, `${lines.join('\n')}\n`)
        return { path, scanned: notes.length, sources: sources.length, open: openCount, completed: completedCount }
      }
    })
  }
}
