import {
  localDateParts,
  logAction,
  notifySuccess,
  writeNote,
  yamlString
} from './shared'

const cleanText = (value, fallback = '') => typeof value === 'string' ? value.trim() || fallback : fallback

const quickCaptureMarkdown = ({ title, content, now }) => [
  '---',
  `title: ${yamlString(title)}`,
  'type: "inbox"',
  'status: "unprocessed"',
  'tags: [inbox, capture]',
  `createdAt: ${yamlString(now.iso)}`,
  `updatedAt: ${yamlString(now.iso)}`,
  '---',
  '',
  `# ${title}`,
  '',
  content || 'Write here, then classify, link or move this note later.',
  '',
  '## Next action',
  '',
  '- [ ] Review and file this capture',
  ''
].join('\n')

export const quickCaptureAddon = {
  manifest: {
    id: 'elephant.quick-capture',
    name: 'Quick Capture',
    version: '1.1.0',
    description: 'Creates a timestamped inbox note with an explicit processing state and next action.',
    author: 'ElephantNote',
    defaultEnabled: true,
    permissions: ['notes.write'],
    contributes: {
      actions: true,
      settings: true
    }
  },

  activate(ctx) {
    ctx.addAction({
      id: 'elephant.quick-capture.create',
      title: 'Create a quick capture note',
      description: 'Create a collision-resistant Inbox note. Optional payload: { title, content }.',
      async run(payload = {}) {
        const now = localDateParts()
        const title = cleanText(payload?.title, 'Quick capture')
        const content = cleanText(payload?.content)
        const filename = `Quick capture ${now.date} ${now.time}-${now.milliseconds}.md`
        const path = `Inbox/${filename}`
        logAction(ctx, 'quick-capture:start', { path, hasContent: Boolean(content) })
        const written = await writeNote(path, quickCaptureMarkdown({ title, content, now }))
        notifySuccess(`Quick capture created: ${path}`)
        logAction(ctx, 'quick-capture:done', { path, changed: written?.changed === true })
        return { path, created: true, written }
      }
    })

    ctx.addSettingsSection({
      id: 'elephant.quick-capture.settings',
      title: 'Quick Capture',
      description: 'Captures are written to Inbox/ with status: unprocessed and a review task.',
      order: 110
    })
  }
}
