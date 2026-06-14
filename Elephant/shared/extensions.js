export const EXTENSION_PLUGIN_IDS = Object.freeze({
  GOOGLE_CALENDAR: 'google-calendar',
  MCP_MEMORY: 'mcp-memory',
  WEB_CLIPPER: 'web-clipper'
})

export const EXTENSION_PLUGIN_RUNTIMES = Object.freeze({
  GOOGLE_CALENDAR_SYNC: 'calendar.google.sync',
  MCP_TOOL_CALL: 'mcp.tools.call',
  SOURCE_INGEST_URL: 'sources.ingestUrl'
})

export const EXTENSION_TASK_ACTIONS = Object.freeze({
  SEARCH_RECENT: 'search:recent',
  SEARCH_SEMANTIC: 'search:semantic',
  WIKI_PROPOSE: 'wiki:propose',
  WIKI_PROPOSAL: 'wiki:proposal',
  CALENDAR_SUMMARY: 'calendar:summary',
  MODEL_TAGGING: 'model:tagging',
  NOTES_UPDATE_FRONTMATTER: 'notes:update-frontmatter'
})

export const EXTENSION_ACTION_STATUS = Object.freeze({
  OK: true,
  NOT_EXECUTABLE: false
})

export const ATOMIC_PLUGIN_MANIFESTS = Object.freeze([
  {
    id: EXTENSION_PLUGIN_IDS.GOOGLE_CALENDAR,
    name: 'Google Calendar',
    status: 'planned',
    runtime: EXTENSION_PLUGIN_RUNTIMES.GOOGLE_CALENDAR_SYNC,
    permissions: ['oauth:google-calendar', 'calendar:read', 'calendar:write', 'notes:create'],
    surfaces: ['settings', 'calendar', 'import']
  },
  {
    id: EXTENSION_PLUGIN_IDS.MCP_MEMORY,
    name: 'MCP Memory',
    status: 'planned',
    runtime: EXTENSION_PLUGIN_RUNTIMES.MCP_TOOL_CALL,
    permissions: ['notes:read', 'notes:write', 'search:semantic', 'sources:ingest'],
    surfaces: ['settings', 'agents']
  },
  {
    id: EXTENSION_PLUGIN_IDS.WEB_CLIPPER,
    name: 'Web Clipper',
    status: 'planned',
    runtime: EXTENSION_PLUGIN_RUNTIMES.SOURCE_INGEST_URL,
    permissions: ['sources:ingest', 'notes:create', 'attachments:write'],
    surfaces: ['settings', 'import']
  }
])

export const PROGRAMMATIC_TASK_TEMPLATES = Object.freeze([
  {
    id: 'daily-briefing',
    name: 'Daily briefing',
    description: 'Summarize recent vault activity and suggest wiki updates.',
    cadence: 'daily',
    prompt: 'Create a short daily briefing from recent notes and calendar context.',
    actions: [
      EXTENSION_TASK_ACTIONS.SEARCH_RECENT,
      EXTENSION_TASK_ACTIONS.WIKI_PROPOSE,
      EXTENSION_TASK_ACTIONS.CALENDAR_SUMMARY
    ]
  },
  {
    id: 'contradiction-scan',
    name: 'Contradiction scan',
    description: 'Search semantically for notes that may disagree with each other.',
    cadence: 'weekly',
    prompt: 'Find possible contradictions or outdated statements across related notes.',
    actions: [
      EXTENSION_TASK_ACTIONS.SEARCH_SEMANTIC,
      EXTENSION_TASK_ACTIONS.WIKI_PROPOSAL
    ]
  },
  {
    id: 'inbox-autotag',
    name: 'Inbox auto-tag',
    description: 'Add frontmatter tags to imported or inbox notes.',
    cadence: 'on-import',
    prompt: 'Generate concise tags for new inbox notes.',
    actions: [
      EXTENSION_TASK_ACTIONS.MODEL_TAGGING,
      EXTENSION_TASK_ACTIONS.NOTES_UPDATE_FRONTMATTER
    ]
  }
])

export const normalizePluginManifest = (manifest = {}) => ({
  id: String(manifest.id || '').trim(),
  name: String(manifest.name || manifest.id || '').trim(),
  status: ['planned', 'enabled', 'disabled'].includes(manifest.status) ? manifest.status : 'planned',
  runtime: String(manifest.runtime || '').trim(),
  permissions: Array.isArray(manifest.permissions)
    ? manifest.permissions.filter(Boolean).map((permission) => String(permission)).filter(Boolean)
    : [],
  surfaces: Array.isArray(manifest.surfaces)
    ? manifest.surfaces.filter(Boolean).map((surface) => String(surface)).filter(Boolean)
    : []
})

export const createDefaultPluginState = (manifests = ATOMIC_PLUGIN_MANIFESTS) => {
  return manifests.reduce((state, manifest) => {
    state[manifest.id] = {
      enabled: manifest.status === 'enabled',
      config: {}
    }
    return state
  }, {})
}

export const mergePluginState = (manifests = ATOMIC_PLUGIN_MANIFESTS, state = {}) => {
  const defaults = createDefaultPluginState(manifests)
  return manifests.map((manifest) => {
    const normalizedManifest = normalizePluginManifest(manifest)
    const saved = state?.[normalizedManifest.id] || {}
    const enabled = typeof saved.enabled === 'boolean'
      ? saved.enabled
      : defaults[normalizedManifest.id]?.enabled || false
    return {
      ...normalizedManifest,
      status: enabled ? 'enabled' : 'disabled',
      enabled,
      config: saved.config && typeof saved.config === 'object' && !Array.isArray(saved.config)
        ? saved.config
        : {}
    }
  })
}

export const updatePluginState = (manifests = ATOMIC_PLUGIN_MANIFESTS, state = {}, patch = {}) => {
  const plugin = manifests.find((manifest) => manifest.id === patch.id)
  if (!plugin) throw new Error('Unknown plugin.')
  const current = state?.[plugin.id] || createDefaultPluginState(manifests)[plugin.id] || {}
  return {
    ...createDefaultPluginState(manifests),
    ...state,
    [plugin.id]: {
      enabled: typeof patch.enabled === 'boolean' ? patch.enabled : Boolean(current.enabled),
      config: patch.config && typeof patch.config === 'object' && !Array.isArray(patch.config)
        ? patch.config
        : current.config || {}
    }
  }
}

export const normalizeProgrammaticTask = (task = {}) => {
  const template = PROGRAMMATIC_TASK_TEMPLATES.find((item) => item.id === task.template || item.id === task.id)
  const id = String(task.id || task.template || template?.id || `task-${Date.now()}`).trim()
  return {
    id,
    name: String(task.name || template?.name || 'Untitled task').trim(),
    description: String(task.description || template?.description || '').trim(),
    cadence: String(task.cadence || template?.cadence || 'manual'),
    enabled: task.enabled !== false,
    prompt: String(task.prompt || template?.prompt || '').trim(),
    actions: Array.isArray(task.actions)
      ? task.actions.filter(Boolean).map((action) => String(action)).filter(Boolean)
      : [...(template?.actions || [])],
    createdAt: String(task.createdAt || new Date().toISOString()),
    updatedAt: String(task.updatedAt || new Date().toISOString())
  }
}

export const createDefaultTaskState = (templates = PROGRAMMATIC_TASK_TEMPLATES) => {
  return templates.reduce((state, template) => {
    state[template.id] = {
      ...normalizeProgrammaticTask({ template: template.id }),
      enabled: false,
      lastRunAt: '',
      lastResult: null
    }
    return state
  }, {})
}

export const mergeTaskState = (templates = PROGRAMMATIC_TASK_TEMPLATES, state = {}) => {
  const merged = new Map()
  for (const template of templates) {
    const saved = state?.[template.id] || {}
    merged.set(template.id, {
      ...normalizeProgrammaticTask({ template: template.id, ...saved, id: template.id }),
      enabled: typeof saved.enabled === 'boolean' ? saved.enabled : false,
      lastRunAt: String(saved.lastRunAt || ''),
      lastResult: saved.lastResult || null
    })
  }
  for (const [id, value] of Object.entries(state || {})) {
    if (merged.has(id)) continue
    merged.set(id, {
      ...normalizeProgrammaticTask({ id, ...value }),
      enabled: value.enabled !== false,
      lastRunAt: String(value.lastRunAt || ''),
      lastResult: value.lastResult || null
    })
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export const updateTaskState = (templates = PROGRAMMATIC_TASK_TEMPLATES, state = {}, patch = {}) => {
  const defaults = createDefaultTaskState(templates)
  const id = String(patch.id || patch.name || '').trim()
  if (!id) throw new Error('Task id is required.')
  const current = state?.[id] || defaults[id] || {}
  const task = normalizeProgrammaticTask({
    ...current,
    ...patch,
    id,
    updatedAt: new Date().toISOString()
  })
  return {
    ...defaults,
    ...state,
    [id]: {
      ...task,
      enabled: typeof patch.enabled === 'boolean' ? patch.enabled : task.enabled,
      lastRunAt: String(patch.lastRunAt || current.lastRunAt || ''),
      lastResult: patch.lastResult === undefined ? current.lastResult || null : patch.lastResult
    }
  }
}

export const resolvePluginRuntime = (plugin = {}) => {
  const normalized = normalizePluginManifest(plugin)
  if (normalized.runtime) return normalized.runtime
  if (normalized.id === EXTENSION_PLUGIN_IDS.GOOGLE_CALENDAR) return EXTENSION_PLUGIN_RUNTIMES.GOOGLE_CALENDAR_SYNC
  if (normalized.id === EXTENSION_PLUGIN_IDS.WEB_CLIPPER) return EXTENSION_PLUGIN_RUNTIMES.SOURCE_INGEST_URL
  if (normalized.id === EXTENSION_PLUGIN_IDS.MCP_MEMORY) return EXTENSION_PLUGIN_RUNTIMES.MCP_TOOL_CALL
  return ''
}

export const createTaskStepResult = ({ action, ok, summary = '' } = {}) => ({
  action: String(action || ''),
  ok: Boolean(ok),
  summary: String(summary || '')
})

export const createTaskRunResult = (steps = []) => ({
  ok: steps.every((step) => step.ok),
  steps: steps.map(createTaskStepResult)
})

export const isExecutableTaskAction = (action = '') => [
  EXTENSION_TASK_ACTIONS.WIKI_PROPOSE,
  EXTENSION_TASK_ACTIONS.WIKI_PROPOSAL,
  EXTENSION_TASK_ACTIONS.CALENDAR_SUMMARY,
  EXTENSION_TASK_ACTIONS.SEARCH_RECENT
].includes(action)
