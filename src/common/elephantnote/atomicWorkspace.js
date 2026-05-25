export const MODEL_PURPOSES = Object.freeze([
  'embedding',
  'chat',
  'tagging',
  'wiki',
  'speech-to-text',
  'text-to-speech'
])

export const ATOMIC_MODEL_CATALOG = Object.freeze([
  {
    id: 'nomic-embed-text',
    name: 'Nomic Embed Text',
    purpose: 'embedding',
    provider: 'ollama',
    local: true,
    size: '274 MB'
  },
  {
    id: 'bge-m3',
    name: 'BGE-M3',
    purpose: 'embedding',
    provider: 'local',
    local: true,
    size: '2.3 GB'
  },
  {
    id: 'llama-3.2',
    name: 'Llama 3.2',
    purpose: 'chat',
    provider: 'ollama',
    local: true,
    size: '2.0 GB'
  },
  {
    id: 'qwen2.5-coder',
    name: 'Qwen2.5 Coder',
    purpose: 'chat',
    provider: 'ollama',
    local: true,
    size: '4.7 GB'
  },
  {
    id: 'mistral-small',
    name: 'Mistral Small',
    purpose: 'tagging',
    provider: 'openai-compatible',
    local: false,
    size: 'remote'
  },
  {
    id: 'llama-3.1-8b',
    name: 'Llama 3.1 8B',
    purpose: 'wiki',
    provider: 'ollama',
    local: true,
    size: '4.9 GB'
  },
  {
    id: 'whisper-large-v3-turbo',
    name: 'Whisper Large v3 Turbo',
    purpose: 'speech-to-text',
    provider: 'local',
    local: true,
    size: '1.6 GB'
  },
  {
    id: 'parakeet-v2',
    name: 'Parakeet v2',
    purpose: 'speech-to-text',
    provider: 'local',
    local: true,
    size: '2.4 GB'
  },
  {
    id: 'kokoro-82m',
    name: 'Kokoro 82M',
    purpose: 'text-to-speech',
    provider: 'local',
    local: true,
    size: '326 MB'
  },
  {
    id: 'kitten-tts',
    name: 'Kitten TTS',
    purpose: 'text-to-speech',
    provider: 'local',
    local: true,
    size: '250 MB'
  }
])

export const ATOMIC_PLUGIN_MANIFESTS = Object.freeze([
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    status: 'planned',
    permissions: ['oauth:google-calendar', 'calendar:read', 'calendar:write', 'notes:create'],
    surfaces: ['settings', 'calendar', 'import']
  },
  {
    id: 'mcp-memory',
    name: 'MCP Memory',
    status: 'planned',
    permissions: ['notes:read', 'notes:write', 'search:semantic', 'sources:ingest'],
    surfaces: ['settings', 'agents']
  },
  {
    id: 'web-clipper',
    name: 'Web Clipper',
    status: 'planned',
    permissions: ['sources:ingest', 'notes:create', 'attachments:write'],
    surfaces: ['settings', 'import']
  }
])

export const PROGRAMMATIC_TASK_TEMPLATES = Object.freeze([
  {
    id: 'daily-briefing',
    name: 'Daily briefing',
    cadence: 'daily',
    actions: ['search:recent', 'wiki:propose', 'calendar:summary']
  },
  {
    id: 'contradiction-scan',
    name: 'Contradiction scan',
    cadence: 'weekly',
    actions: ['search:semantic', 'wiki:proposal']
  },
  {
    id: 'inbox-autotag',
    name: 'Inbox auto-tag',
    cadence: 'on-import',
    actions: ['model:tagging', 'notes:update-frontmatter']
  }
])

export const getModelsByPurpose = (purpose, catalog = ATOMIC_MODEL_CATALOG) => {
  if (!MODEL_PURPOSES.includes(purpose)) return []
  return catalog.filter((model) => model.purpose === purpose)
}

export const createDefaultModelSelection = (catalog = ATOMIC_MODEL_CATALOG) => {
  return MODEL_PURPOSES.reduce((selection, purpose) => {
    selection[purpose] = catalog.find((model) => model.purpose === purpose)?.id || ''
    return selection
  }, {})
}

export const normalizePluginManifest = (manifest = {}) => ({
  id: String(manifest.id || '').trim(),
  name: String(manifest.name || manifest.id || '').trim(),
  status: ['planned', 'enabled', 'disabled'].includes(manifest.status) ? manifest.status : 'planned',
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
  const template = PROGRAMMATIC_TASK_TEMPLATES.find((item) => item.id === task.template)
  return {
    id: String(task.id || task.template || template?.id || '').trim(),
    name: String(task.name || template?.name || 'Untitled task').trim(),
    cadence: String(task.cadence || template?.cadence || 'manual'),
    enabled: task.enabled !== false,
    actions: Array.isArray(task.actions)
      ? task.actions.filter(Boolean).map((action) => String(action)).filter(Boolean)
      : [...(template?.actions || [])]
  }
}
