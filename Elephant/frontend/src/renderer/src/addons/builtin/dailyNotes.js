import {
  createNoteIfMissing,
  localDateParts,
  logAction,
  notifyCreated,
  offsetLocalDate,
  yamlString
} from './shared'

const dailyNoteMarkdown = (now, yesterday, tomorrow) => [
  '---',
  `title: ${yamlString(`${now.weekday}, ${now.date}`)}`,
  'type: "daily-note"',
  'tags: [daily]',
  `date: ${yamlString(now.date)}`,
  `createdAt: ${yamlString(now.iso)}`,
  `updatedAt: ${yamlString(now.iso)}`,
  '---',
  '',
  `# ${now.weekday}, ${now.date}`,
  '',
  `← [[Daily/${yesterday.date}|${yesterday.date}]] · [[Daily/${tomorrow.date}|${tomorrow.date}]] →`,
  '',
  '## Focus',
  '',
  '- ',
  '',
  '## Tasks',
  '',
  '- [ ] ',
  '',
  '## Notes',
  '',
  '## End-of-day review',
  '',
  '- **Completed:** ',
  '- **Blocked:** ',
  '- **Carry forward:** ',
  ''
].join('\n')

export const dailyNotesAddon = {
  manifest: {
    id: 'elephant.daily-notes',
    name: 'Daily Notes',
    version: '1.1.0',
    description: 'Creates a linked daily workspace with focus, tasks, notes and review sections.',
    author: 'ElephantNote',
    defaultEnabled: true,
    permissions: ['notes.read', 'notes.write'],
    contributes: {
      actions: true,
      settings: true
    }
  },

  activate(ctx) {
    ctx.addAction({
      id: 'elephant.daily-notes.open-today',
      title: "Open today's daily note",
      description: 'Create Daily/YYYY-MM-DD.md when missing, otherwise open the existing note.',
      async run() {
        const now = localDateParts()
        const yesterday = offsetLocalDate(-1)
        const tomorrow = offsetLocalDate(1)
        const path = `Daily/${now.date}.md`
        logAction(ctx, 'daily-note:start', { path })
        const result = await createNoteIfMissing(path, dailyNoteMarkdown(now, yesterday, tomorrow))
        notifyCreated('Daily note', result)
        logAction(ctx, 'daily-note:done', { path, created: result.created })
        return result
      }
    })

    ctx.addSettingsSection({
      id: 'elephant.daily-notes.settings',
      title: 'Daily Notes',
      description: 'Daily notes are linked to adjacent days and existing content is never overwritten.',
      order: 100
    })
  }
}
