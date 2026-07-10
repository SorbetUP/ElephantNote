const wikilinkPattern = /\[\[([^\]]+)\]\]/g

const normalizeTarget = (value) => String(value || '')
  .split('|')[0]
  .split('#')[0]
  .trim()
  .replace(/^\/+/, '')
  .replace(/\\/g, '/')
  .replace(/\.md$/i, '')

const noteKey = (path) => String(path || '').replace(/\\/g, '/').replace(/\.md$/i, '')
const basename = (path) => noteKey(path).split('/').pop().toLocaleLowerCase()
const directoryOf = (path) => {
  const parts = noteKey(path).split('/')
  return parts.length > 1 ? parts.slice(0, -1).join('/') : ''
}
const titleFor = (path, content) => {
  const heading = String(content || '').split(/\r?\n/).find((line) => /^#\s+\S/.test(line.trim()))
  return heading ? heading.trim().replace(/^#\s+/, '') : noteKey(path).split('/').pop()
}
const linkTo = (path, title) => `[[${noteKey(path)}|${String(title || path).replaceAll('|', '\\|')}]]`

self.elephantAddon = {
  activate(api) {
    return api.commands.register({
      id: 'com.elephantnote.broken-links-auditor.audit',
      title: 'Audit broken wikilinks',
      description: 'Scan the vault and generate Reports/Broken Links.md.',
      async run() {
        const listed = await api.notes.list('.')
        const entries = Array.isArray(listed) ? listed.filter((entry) => entry.path !== 'Reports/Broken Links.md') : []
        const notes = []
        for (const entry of entries) {
          const note = await api.notes.read(entry.path)
          notes.push({ path: entry.path, content: String(note.content || ''), title: titleFor(entry.path, note.content) })
        }

        const exact = new Map(notes.map((note) => [noteKey(note.path).toLocaleLowerCase(), note.path]))
        const byBase = new Map()
        for (const note of notes) {
          const key = basename(note.path)
          if (!byBase.has(key)) byBase.set(key, [])
          byBase.get(key).push(note.path)
        }

        const broken = []
        const ambiguous = []
        let checked = 0

        for (const note of notes) {
          const lines = note.content.split(/\r?\n/)
          for (const [lineIndex, line] of lines.entries()) {
            wikilinkPattern.lastIndex = 0
            for (const match of line.matchAll(wikilinkPattern)) {
              const raw = match[1]
              const target = normalizeTarget(raw)
              if (!target || /^[a-z]+:\/\//i.test(target)) continue
              checked += 1

              const targetLower = target.toLocaleLowerCase()
              const sameDirectory = directoryOf(note.path)
              const relativeKey = sameDirectory ? `${sameDirectory}/${target}`.toLocaleLowerCase() : targetLower
              const direct = exact.get(targetLower) || exact.get(relativeKey)
              if (direct) continue

              const candidates = byBase.get(targetLower.split('/').pop()) || []
              if (candidates.length === 1) continue
              const issue = {
                source: note.path,
                sourceTitle: note.title,
                line: lineIndex + 1,
                raw,
                target,
                candidates
              }
              if (candidates.length > 1) ambiguous.push(issue)
              else broken.push(issue)
            }
          }
        }

        const generatedAt = new Date().toISOString()
        const lines = [
          '---',
          'title: "Broken Links Audit"',
          'type: "generated-report"',
          'tags: [links, audit]',
          `generatedAt: ${JSON.stringify(generatedAt)}`,
          '---',
          '',
          '# Broken Links Audit',
          '',
          `Generated: ${generatedAt}`,
          '',
          '## Summary',
          '',
          `- Notes scanned: ${notes.length}`,
          `- Wikilinks checked: ${checked}`,
          `- Broken links: ${broken.length}`,
          `- Ambiguous links: ${ambiguous.length}`,
          '',
          '## Broken links',
          ''
        ]

        if (!broken.length) lines.push('- None')
        for (const issue of broken) {
          lines.push(`- ${linkTo(issue.source, issue.sourceTitle)} line ${issue.line}: \`[[${issue.raw}]]\``)
        }

        lines.push('', '## Ambiguous links', '')
        if (!ambiguous.length) lines.push('- None')
        for (const issue of ambiguous) {
          lines.push(`- ${linkTo(issue.source, issue.sourceTitle)} line ${issue.line}: \`[[${issue.raw}]]\``)
          for (const candidate of issue.candidates) lines.push(`  - Candidate: ${linkTo(candidate, candidate)}`)
        }
        lines.push('')

        const path = 'Reports/Broken Links.md'
        await api.notes.write(path, lines.join('\n'))
        return { path, notes: notes.length, checked, broken: broken.length, ambiguous: ambiguous.length }
      }
    })
  }
}
