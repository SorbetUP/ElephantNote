import { ElMessage } from 'element-plus'

const invokeTauri = (command, payload = {}) => {
  const invoke = globalThis?.__TAURI__?.core?.invoke
  if (typeof invoke !== 'function') {
    throw new Error(`Tauri command API is unavailable for ${command}`)
  }
  return invoke(command, payload)
}

const pad = (value, length = 2) => String(value).padStart(length, '0')

const localDateParts = (date = new Date()) => ({
  date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
  time: `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`,
  milliseconds: pad(date.getMilliseconds(), 3),
  iso: date.toISOString()
})

const yamlString = (value) => JSON.stringify(String(value))

const readNote = (path) => invokeTauri('tauri_notes_read', { relativePath: path })

const writeNote = (path, content) => invokeTauri('tauri_notes_write', {
  relativePath: path,
  content
})

const createNoteIfMissing = async(path, content) => {
  try {
    const existing = await readNote(path)
    return { path, created: false, existing }
  } catch {
    const written = await writeNote(path, content)
    return { path, created: true, written }
  }
}

const notifyCreated = (label, result) => {
  ElMessage.success(result.created
    ? `${label} created: ${result.path}`
    : `${label} already exists: ${result.path}`)
}

const logAction = (ctx, phase, payload) => {
  ctx.logger?.info?.(`[addons] builtin:${phase}`, payload)
}

export const dailyNotesAddon = {
  manifest: {
    id: 'elephant.daily-notes',
    name: 'Daily Notes',
    version: '1.0.0',
    description: 'Creates one dated Markdown note per day under Daily/.',
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
      title: "Create today's daily note",
      description: 'Create Daily/YYYY-MM-DD.md without overwriting an existing note.',
      async run() {
        const now = localDateParts()
        const path = `Daily/${now.date}.md`
        logAction(ctx, 'daily-note:start', { path })
        const content = [
          '---',
          `title: ${yamlString(now.date)}`,
          'type: "daily-note"',
          'tags: [daily]',
          `createdAt: ${yamlString(now.iso)}`,
          `updatedAt: ${yamlString(now.iso)}`,
          '---',
          '',
          `# ${now.date}`,
          '',
          '## Notes',
          '',
          '## Tasks',
          '',
          '- [ ] ',
          ''
        ].join('\n')
        const result = await createNoteIfMissing(path, content)
        notifyCreated('Daily note', result)
        logAction(ctx, 'daily-note:done', { path, created: result.created })
        return result
      }
    })

    ctx.addSettingsSection({
      id: 'elephant.daily-notes.settings',
      title: 'Daily Notes',
      description: 'Daily notes are stored in Daily/ and existing notes are never overwritten.',
      order: 100
    })
  }
}

export const quickCaptureAddon = {
  manifest: {
    id: 'elephant.quick-capture',
    name: 'Quick Capture',
    version: '1.0.0',
    description: 'Creates a timestamped inbox note for ideas that need to be sorted later.',
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
      description: 'Create a unique note under Inbox/ using the current date and time.',
      async run() {
        const now = localDateParts()
        const filename = `Quick capture ${now.date} ${now.time}-${now.milliseconds}.md`
        const path = `Inbox/${filename}`
        logAction(ctx, 'quick-capture:start', { path })
        const content = [
          '---',
          'title: "Quick capture"',
          'type: "inbox"',
          'tags: [inbox]',
          `createdAt: ${yamlString(now.iso)}`,
          `updatedAt: ${yamlString(now.iso)}`,
          '---',
          '',
          '# Quick capture',
          '',
          'Write here, then classify or move this note later.',
          ''
        ].join('\n')
        const written = await writeNote(path, content)
        ElMessage.success(`Quick capture created: ${path}`)
        logAction(ctx, 'quick-capture:done', { path, changed: written?.changed === true })
        return { path, created: true, written }
      }
    })

    ctx.addSettingsSection({
      id: 'elephant.quick-capture.settings',
      title: 'Quick Capture',
      description: 'Captures are written to Inbox/ with collision-resistant timestamped filenames.',
      order: 110
    })
  }
}

const reportMarkdown = (inspection, generatedAt) => {
  const documents = Array.isArray(inspection?.documents) ? inspection.documents : []
  const edges = Array.isArray(inspection?.graph?.edges) ? inspection.graph.edges : []
  const linkedSources = new Set(edges.map((edge) => edge?.source).filter(Boolean))
  const linkedTargets = new Set(edges.map((edge) => edge?.target).filter(Boolean))
  const orphanDocuments = documents.filter((document) => {
    const path = document?.relativePath || document?.path
    return path && !linkedSources.has(path) && !linkedTargets.has(path)
  })

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
    `- Notes without resolved links: ${orphanDocuments.length}`,
    '',
    '## Notes',
    ''
  ]

  if (documents.length === 0) {
    lines.push('- No Markdown notes were found.')
  } else {
    for (const document of documents.slice(0, 100)) {
      const title = document?.title || document?.label || document?.relativePath || 'Untitled'
      const path = document?.relativePath || document?.path || ''
      lines.push(`- [[${path.replace(/\.md$/i, '')}|${title}]]`)
    }
    if (documents.length > 100) {
      lines.push(`- …and ${documents.length - 100} more notes`)
    }
  }

  lines.push('', '## Notes without resolved links', '')
  if (orphanDocuments.length === 0) {
    lines.push('- None')
  } else {
    for (const document of orphanDocuments.slice(0, 100)) {
      const title = document?.title || document?.label || document?.relativePath || 'Untitled'
      const path = document?.relativePath || document?.path || ''
      lines.push(`- [[${path.replace(/\.md$/i, '')}|${title}]]`)
    }
  }
  lines.push('')
  return lines.join('\n')
}

export const vaultOverviewAddon = {
  manifest: {
    id: 'elephant.vault-overview',
    name: 'Vault Overview',
    version: '1.0.0',
    description: 'Generates a real report from the current Markdown index and resolved wiki links.',
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
        const written = await writeNote(path, reportMarkdown(inspection, generatedAt))
        const result = {
          path,
          notes: Array.isArray(inspection?.documents) ? inspection.documents.length : 0,
          links: Array.isArray(inspection?.graph?.edges) ? inspection.graph.edges.length : 0,
          written
        }
        ElMessage.success(`Vault overview updated: ${path}`)
        logAction(ctx, 'vault-overview:done', result)
        return result
      }
    })

    ctx.addSettingsSection({
      id: 'elephant.vault-overview.settings',
      title: 'Vault Overview',
      description: 'The generated report is stored in Reports/Vault Overview.md.',
      order: 120
    })
  }
}

export const addonInspectorAddon = {
  manifest: {
    id: 'elephant.addon-inspector',
    name: 'Addon Inspector',
    version: '0.2.0',
    description: 'Developer helper demonstrating actions, settings and sidebar contributions.',
    author: 'ElephantNote',
    defaultEnabled: false,
    permissions: [],
    contributes: {
      settings: true,
      actions: true,
      sidebar: true
    }
  },

  activate(ctx) {
    ctx.addAction({
      id: 'elephant.addon-inspector.open',
      title: 'Open Addon Inspector',
      description: 'Open the Addons section in the active settings panel.',
      run: () => {
        globalThis.dispatchEvent?.(new CustomEvent('elephantnote:open-settings', {
          detail: { section: 'addons' }
        }))
        return { section: 'addons' }
      }
    })

    ctx.addSidebarItem({
      id: 'elephant.addon-inspector.rail',
      title: 'Addon Inspector',
      tooltip: 'Open Addon Inspector',
      actionId: 'elephant.addon-inspector.open',
      order: 100
    })

    ctx.addSettingsSection({
      id: 'elephant.addon-inspector.settings',
      title: 'Addon Inspector',
      description: 'Sample settings section registered through the addon system.',
      order: 1000
    })
  }
}

export const builtinAddons = [
  dailyNotesAddon,
  quickCaptureAddon,
  vaultOverviewAddon,
  addonInspectorAddon
]
