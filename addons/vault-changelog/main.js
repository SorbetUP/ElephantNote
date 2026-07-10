const REPORT_PATH = 'Reports/Vault Changelog.md'

const snapshotFrom = (entries) => Object.fromEntries(entries
  .filter((entry) => entry.path !== REPORT_PATH)
  .map((entry) => [entry.path, {
    size: Number(entry.size || 0),
    modifiedAt: Number(entry.modifiedAt || 0)
  }]))

const noteLink = (path) => `[[${path.replace(/\.md$/i, '')}|${path.split('/').pop().replace(/\.md$/i, '')}]]`

self.elephantAddon = {
  activate(api) {
    return api.commands.register({
      id: 'com.elephantnote.vault-changelog.snapshot',
      title: 'Update vault changelog',
      description: 'Compare the current visible Markdown vault with the previous manual snapshot.',
      async run() {
        const entries = await api.notes.list('.')
        const current = snapshotFrom(entries)
        const previous = await api.storage.get('snapshot')
        const generatedAt = new Date().toISOString()
        const created = []
        const modified = []
        const deleted = []

        if (previous && typeof previous === 'object') {
          for (const [path, value] of Object.entries(current)) {
            if (!previous[path]) created.push(path)
            else if (Number(previous[path].size || 0) !== value.size || Number(previous[path].modifiedAt || 0) !== value.modifiedAt) {
              modified.push(path)
            }
          }
          for (const path of Object.keys(previous)) {
            if (!current[path]) deleted.push(path)
          }
        }

        created.sort()
        modified.sort()
        deleted.sort()
        const baseline = !previous || typeof previous !== 'object'
        const latest = Object.entries(current)
          .sort((left, right) => right[1].modifiedAt - left[1].modifiedAt || left[0].localeCompare(right[0]))
          .slice(0, 20)

        const lines = [
          '---',
          'title: "Vault Changelog"',
          'type: "generated-report"',
          `generatedAt: ${JSON.stringify(generatedAt)}`,
          `baseline: ${baseline}`,
          '---',
          '',
          '# Vault Changelog',
          '',
          baseline
            ? `Initial baseline created with ${Object.keys(current).length} visible Markdown notes.`
            : `Compared ${Object.keys(current).length} visible Markdown notes with the previous snapshot.`,
          '',
          `- Created: ${created.length}`,
          `- Modified: ${modified.length}`,
          `- Deleted: ${deleted.length}`,
          '',
          '## Created',
          ''
        ]

        if (created.length) for (const path of created) lines.push(`- ${noteLink(path)}`)
        else lines.push('_None._')
        lines.push('', '## Modified', '')
        if (modified.length) for (const path of modified) lines.push(`- ${noteLink(path)}`)
        else lines.push('_None._')
        lines.push('', '## Deleted', '')
        if (deleted.length) for (const path of deleted) lines.push(`- \`${path}\``)
        else lines.push('_None._')

        if (baseline) {
          lines.push('', '## Most recently modified at baseline', '')
          for (const [path, value] of latest) {
            const stamp = value.modifiedAt ? new Date(value.modifiedAt).toISOString() : 'Unknown'
            lines.push(`- ${noteLink(path)} — ${stamp}`)
          }
        }
        lines.push('')

        await api.notes.write(REPORT_PATH, lines.join('\n'))
        await api.storage.set('snapshot', current)
        await api.storage.set('lastRun', { generatedAt, created: created.length, modified: modified.length, deleted: deleted.length })
        return { path: REPORT_PATH, baseline, created: created.length, modified: modified.length, deleted: deleted.length }
      }
    })
  }
}
