export const MODEL_GROUPS = Object.freeze([
  {
    id: 'embedding',
    label: 'Embedding / Search',
    description: 'Vector search, semantic search and Note Graph retrieval.',
    purposes: ['embedding']
  },
  {
    id: 'tagging',
    label: 'Tagging / Naming',
    description: 'Very small models are enough for auto-tagging, auto-naming and quick metadata extraction.',
    purposes: ['tagging', 'naming']
  },
  {
    id: 'wiki',
    label: 'Wiki / Summary',
    description: 'Stronger instruction models for cited synthesis, summaries and restructuring.',
    purposes: ['wiki', 'summary']
  },
  {
    id: 'chat',
    label: 'Chat / Agent',
    description: 'Assistant, RAG chat, tool use and external agent bridges.',
    purposes: ['chat', 'agent']
  },
  {
    id: 'audio',
    label: 'Audio',
    description: 'Speech-to-text and text-to-speech engines.',
    purposes: ['speech-to-text', 'text-to-speech']
  }
])

export const MODEL_PURPOSES = Object.freeze([
  'embedding',
  'tagging',
  'naming',
  'wiki',
  'summary',
  'chat',
  'agent',
  'speech-to-text',
  'text-to-speech'
])

export const ATOMIC_MODEL_CATALOG = Object.freeze([
  {
    id: 'all-minilm',
    name: 'all-MiniLM',
    purpose: 'embedding',
    category: 'embedding',
    provider: 'ollama',
    local: true,
    pull: 'all-minilm',
    size: '46 MB',
    quality: 'fast',
    notes: 'Tiny embedding model for quick indexing and low-memory vaults.'
  },
  {
    id: 'nomic-embed-text',
    name: 'Nomic Embed Text',
    purpose: 'embedding',
    category: 'embedding',
    provider: 'ollama',
    local: true,
    pull: 'nomic-embed-text',
    size: '274 MB',
    quality: 'balanced',
    notes: 'Good default embedding model with larger context than MiniLM.'
  },
  {
    id: 'bge-m3',
    name: 'BGE-M3',
    purpose: 'embedding',
    category: 'embedding',
    provider: 'ollama',
    local: true,
    pull: 'bge-m3',
    size: '1.2 GB',
    quality: 'strong',
    notes: 'Strong multilingual retrieval model for French/English mixed vaults.'
  },
  {
    id: 'snowflake-arctic-embed2',
    name: 'Snowflake Arctic Embed 2',
    purpose: 'embedding',
    category: 'embedding',
    provider: 'ollama',
    local: true,
    pull: 'snowflake-arctic-embed2',
    size: '1.2 GB',
    quality: 'strong',
    notes: 'Strong multilingual embedding model, useful when quality matters more than disk.'
  },
  {
    id: 'gemma3:270m',
    name: 'Gemma 3 270M',
    purpose: 'tagging',
    category: 'tagging',
    provider: 'ollama',
    local: true,
    pull: 'gemma3:270m',
    size: 'small',
    quality: 'tiny',
    notes: 'Tiny model for cheap auto-tagging and naming.'
  },
  {
    id: 'qwen2.5:0.5b',
    name: 'Qwen2.5 0.5B',
    purpose: 'tagging',
    category: 'tagging',
    provider: 'ollama',
    local: true,
    pull: 'qwen2.5:0.5b',
    size: '398 MB',
    quality: 'tiny',
    notes: 'Small multilingual instruction model, good for tags, titles and short JSON outputs.'
  },
  {
    id: 'gemma3:1b',
    name: 'Gemma 3 1B',
    purpose: 'tagging',
    category: 'tagging',
    provider: 'ollama',
    local: true,
    pull: 'gemma3:1b',
    size: '815 MB',
    quality: 'small',
    notes: 'Small but more capable than 270M for metadata and short summaries.'
  },
  {
    id: 'llama3.2:1b',
    name: 'Llama 3.2 1B',
    purpose: 'naming',
    category: 'tagging',
    provider: 'ollama',
    local: true,
    pull: 'llama3.2:1b',
    size: '1.3 GB',
    quality: 'small',
    notes: 'Personal information management, naming and rewriting on edge devices.'
  },
  {
    id: 'llama3.2:3b',
    name: 'Llama 3.2 3B',
    purpose: 'summary',
    category: 'wiki',
    provider: 'ollama',
    local: true,
    pull: 'llama3.2:3b',
    size: '2 GB',
    quality: 'balanced',
    notes: 'Good default for summaries, rewriting and simple tool use.'
  },
  {
    id: 'qwen2.5:3b',
    name: 'Qwen2.5 3B',
    purpose: 'summary',
    category: 'wiki',
    provider: 'ollama',
    local: true,
    pull: 'qwen2.5:3b',
    size: '2 GB',
    quality: 'balanced',
    notes: 'Good multilingual structured-output model for summary and note cleanup.'
  },
  {
    id: 'qwen2.5:7b',
    name: 'Qwen2.5 7B',
    purpose: 'wiki',
    category: 'wiki',
    provider: 'ollama',
    local: true,
    pull: 'qwen2.5:7b',
    size: '4.7 GB',
    quality: 'strong',
    notes: 'Stronger synthesis model for cited wiki generation.'
  },
  {
    id: 'llama3.1:8b',
    name: 'Llama 3.1 8B',
    purpose: 'wiki',
    category: 'wiki',
    provider: 'ollama',
    local: true,
    pull: 'llama3.1:8b',
    size: '4.9 GB',
    quality: 'strong',
    notes: 'Strong local general model for wiki and long summaries.'
  },
  {
    id: 'qwen2.5-coder:7b',
    name: 'Qwen2.5 Coder 7B',
    purpose: 'agent',
    category: 'chat',
    provider: 'ollama',
    local: true,
    pull: 'qwen2.5-coder:7b',
    size: '4.7 GB',
    quality: 'code',
    notes: 'Useful for code-oriented agent workflows.'
  },
  {
    id: 'codex-compatible',
    name: 'Codex-compatible Agent',
    purpose: 'agent',
    category: 'chat',
    provider: 'openai-compatible',
    local: false,
    pull: '',
    size: 'remote',
    quality: 'agent',
    notes: 'External agent bridge configured in AI > Providers.'
  },
  {
    id: 'whisper-large-v3-turbo',
    name: 'Whisper Large v3 Turbo',
    purpose: 'speech-to-text',
    category: 'audio',
    provider: 'local',
    local: true,
    pull: '',
    size: '1.6 GB',
    quality: 'strong',
    notes: 'Speech-to-text placeholder for the future audio pipeline.'
  },
  {
    id: 'kokoro-82m',
    name: 'Kokoro 82M',
    purpose: 'text-to-speech',
    category: 'audio',
    provider: 'local',
    local: true,
    pull: '',
    size: '326 MB',
    quality: 'small',
    notes: 'Small text-to-speech placeholder for the future audio pipeline.'
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
    description: 'Summarize recent vault activity and suggest wiki updates.',
    cadence: 'daily',
    prompt: 'Create a short daily briefing from recent notes and calendar context.',
    actions: ['search:recent', 'wiki:propose', 'calendar:summary']
  },
  {
    id: 'contradiction-scan',
    name: 'Contradiction scan',
    description: 'Search semantically for notes that may disagree with each other.',
    cadence: 'weekly',
    prompt: 'Find possible contradictions or outdated statements across related notes.',
    actions: ['search:semantic', 'wiki:proposal']
  },
  {
    id: 'inbox-autotag',
    name: 'Inbox auto-tag',
    description: 'Add frontmatter tags to imported or inbox notes.',
    cadence: 'on-import',
    prompt: 'Generate concise tags for new inbox notes.',
    actions: ['model:tagging', 'notes:update-frontmatter']
  }
])

export const getModelGroups = () => MODEL_GROUPS

export const getModelsByPurpose = (purpose, catalog = ATOMIC_MODEL_CATALOG) => {
  if (!MODEL_PURPOSES.includes(purpose)) return []
  return catalog.filter((model) => model.purpose === purpose)
}

export const getModelsByCategory = (category, catalog = ATOMIC_MODEL_CATALOG) => {
  return catalog.filter((model) => model.category === category || model.purpose === category)
}

export const createDefaultModelSelection = () => MODEL_PURPOSES.reduce((selection, purpose) => {
  selection[purpose] = ''
  return selection
}, {})

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
