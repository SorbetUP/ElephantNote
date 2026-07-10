import {
  invokeTauri,
  logAction,
  markdownLink,
  notifySuccess,
  sortByPath,
  writeNote,
  yamlString
} from './shared'

const documentPath = (document) => document?.relativePath || document?.path || ''
const documentTitle = (document) => document?.title || document?.label || documentPath(document) || 'Untitled'

const graphStats = (documents, edges) => {
  const inbound = new Map()
  const outbound = new Map()
  const linkedPaths = new Set()

  for (const edge of edges) {
    const source = String(edge?.source || '')
    const target = String(edge?.target || '')
    if (source) {
      linkedPaths.add(source)
      outbound.set(source, (outbound.get(source) || 0) + 1)
    }
    if (target) {
      linkedPaths.add(target)
      inbound.set(target, (inbound.get(target) || 0) + 1)
    }
  }

  const orphans = documents.filter((document) => {
    const path = documentPath(document)
    return path && !linkedPaths.has(path)
  })

  const topLinked = documents
    .map((document) => {
      const path = documentPath(document)
      return {
        document,
        path,
        inbound: inbound.get(path) || 0,
        outbound: outbound.get(path) || 0
      }
    })
    .filter((entry) => entry.inbound > 0 || entry.outbound > 0)
    .sort((left, right) => right.inbound - left.inbound || right.outbound - left.outbound || left.path.localeCompare(right.path))

  return { inbound, outbound, orphans, topLinked }
}

export const reportMarkdown = (inspection, generatedAt) => {
  const documents = (Array.isArray(inspection?.documents) ? inspection.documents : []).slice().sort(sortByPath)
  const edges = Array.isArray(inspection?.graph?.edges) ? inspection.graph.edges : []
  const { orphans, topLinked } = graphStats(documents, edges)
  const linkedDocuments = documents.length - orphans.length
  const linkCoverage = documents.length > 0 ? Math.round((linkedDocuments / documents.length) * 100) : 0

  const lines = [
    '---',
    'title: "Vault Overview"',
    'type: "generated-report"',
    'tags: [report, vault]',
    `generatedAt: ${yamlString(generatedAt)}`,
    '---',
    '',
    '# Vault Overview',
    '',
    `Generated: ${generatedAt}`,
    '',
    '## Summary',
    '',
    `- Notes indexed: ${documents.length}`,
    `- Wiki links resolved: ${edges.length}`,
    `- Notes connected to the graph: ${linkedDocuments}`,
    `- Notes without resolved links: ${orphans.length}`,
    `- Link coverage: ${linkCoverage}%`,
    '',
    '## Most connected notes',
    ''
  ]

  if (topLinked.length === 0) {
    lines.push('- No resolved links were found.')
  } else {
    for (const entry of topLinked.slice(0, 20)) {
      lines.push(`- ${markdownLink(entry.path, documentTitle(entry.document))} — ${entry.inbound} incoming, ${entry.outbound} outgoing`)
    }
  }

  lines.push('', '## Notes without resolved links', '')
  if (orphans.length === 0) {
    lines.push('- None')
  } else {
    for (const document of orphans.slice(0, 100)) {
      lines.push(`- ${markdownLink(documentPath(document), documentTitle(document))}`)
    }
    if (orphans.length > 100) lines.push(`- …and ${orphans.length - 100} more`)
  }

  lines.push('', '## Note index', '')
  if (documents.length === 0) {
    lines.push('- No Markdown notes were found.')
  } else {
    for (const document of documents.slice(0, 200)) {
      lines.push(`- ${markdownLink(documentPath(document), documentTitle(document))}`)
    }
    if (documents.length > 200) lines.push(`- …and ${documents.length - 200} more`)
  }

  lines.push('')
  return lines.join('\n')
}

export const vaultOverviewAddon = {
  manifest: {
    id: 'elephant.vault-overview',
    name: 'Vault Overview',
    version: '1.1.0',
    description: 'Generates graph coverage, orphan-note and connected-note reports from the current vault index.',
    author: 'ElephantNote',
    defaultEnabled: true,
    permissions: ['notes.read', 'notes.write', 'search.inspect'],
    contributes: {
      actions: true,
      settings: true
    }
  },

  activate(ctx) {
    ctx.addAction({
      id: 'elephant.vault-overview.generate',
      title: 'Generate vault overview',
      description: 'Inspect the current vault and update Reports/Vault Overview.md.',
      async run() {
        const generatedAt = new Date().toISOString()
        const path = 'Reports/Vault Overview.md'
        logAction(ctx, 'vault-overview:start', { path })
        const inspection = await invokeTauri('tauri_search_inspect')
        const content = reportMarkdown(inspection, generatedAt)
        const written = await writeNote(path, content)
        const result = {
          path,
          notes: Array.isArray(inspection?.documents) ? inspection.documents.length : 0,
          links: Array.isArray(inspection?.graph?.edges) ? inspection.graph.edges.length : 0,
          written
        }
        notifySuccess(`Vault overview updated: ${path}`)
        logAction(ctx, 'vault-overview:done', result)
        return result
      }
    })

    ctx.addSettingsSection({
      id: 'elephant.vault-overview.settings',
      title: 'Vault Overview',
      description: 'Reports graph coverage, connected notes and orphan notes in Reports/Vault Overview.md.',
      order: 120
    })
  }
}
