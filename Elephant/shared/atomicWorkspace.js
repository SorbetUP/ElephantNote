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
    id: 'minilm-embedding-browser',
    name: 'MiniLM Embeddings Browser',
    purpose: 'embedding',
    category: 'embedding',
    provider: 'browser',
    engine: 'transformersjs',
    task: 'feature-extraction',
    browserModel: 'Xenova/all-MiniLM-L6-v2',
    backend: 'auto',
    dtype: 'q8',
    local: true,
    pull: '',
    size: '~90 MB',
    quality: 'fast',
    notes: 'Browser-cached embedding model. WebGPU when available, WebCPU/WASM fallback otherwise.'
  },
  {
    id: 'qwen25-05b-tagging-browser',
    name: 'Qwen2.5 0.5B Browser',
    purpose: 'tagging',
    category: 'tagging',
    provider: 'browser',
    engine: 'transformersjs',
    task: 'text-generation',
    browserModel: 'onnx-community/Qwen2.5-0.5B-Instruct',
    backend: 'auto',
    dtype: 'q4',
    local: true,
    pull: '',
    size: '~750 MB',
    quality: 'tiny',
    notes: 'Default browser model for tags, titles and short structured outputs.'
  },
  {
    id: 'qwen25-05b-naming-browser',
    name: 'Qwen2.5 0.5B Browser',
    purpose: 'naming',
    category: 'tagging',
    provider: 'browser',
    engine: 'transformersjs',
    task: 'text-generation',
    browserModel: 'onnx-community/Qwen2.5-0.5B-Instruct',
    backend: 'auto',
    dtype: 'q4',
    local: true,
    pull: '',
    size: '~750 MB',
    quality: 'tiny',
    notes: 'Same cached model reused for automatic note naming.'
  },
  {
    id: 'qwen25-05b-summary-browser',
    name: 'Qwen2.5 0.5B Browser',
    purpose: 'summary',
    category: 'wiki',
    provider: 'browser',
    engine: 'transformersjs',
    task: 'text-generation',
    browserModel: 'onnx-community/Qwen2.5-0.5B-Instruct',
    backend: 'auto',
    dtype: 'q4',
    local: true,
    pull: '',
    size: '~750 MB',
    quality: 'small',
    notes: 'MVP summary model. Not perfect, but it runs inside Electron without Ollama.'
  },
  {
    id: 'qwen25-05b-wiki-browser',
    name: 'Qwen2.5 0.5B Browser',
    purpose: 'wiki',
    category: 'wiki',
    provider: 'browser',
    engine: 'transformersjs',
    task: 'text-generation',
    browserModel: 'onnx-community/Qwen2.5-0.5B-Instruct',
    backend: 'auto',
    dtype: 'q4',
    local: true,
    pull: '',
    size: '~750 MB',
    quality: 'small',
    notes: 'Small cited synthesis model for the first working browser AI path.'
  },
  {
    id: 'qwen25-05b-chat-browser',
    name: 'Qwen2.5 0.5B Browser Chat',
    purpose: 'chat',
    category: 'chat',
    provider: 'browser',
    engine: 'transformersjs',
    task: 'text-generation',
    browserModel: 'onnx-community/Qwen2.5-0.5B-Instruct',
    backend: 'auto',
    dtype: 'q4',
    local: true,
    pull: '',
    size: '~750 MB',
    quality: 'small',
    notes: 'Recommended MVP chat model. Downloads through the browser cache with progress.'
  },
  {
    id: 'qwen25-coder-05b-agent-browser',
    name: 'Qwen2.5 Coder 0.5B Browser',
    purpose: 'agent',
    category: 'chat',
    provider: 'browser',
    engine: 'transformersjs',
    task: 'text-generation',
    browserModel: 'onnx-community/Qwen2.5-Coder-0.5B-Instruct',
    backend: 'auto',
    dtype: 'q4',
    local: true,
    pull: '',
    size: '~750 MB',
    quality: 'code-small',
    notes: 'Small browser-side code/agent model. Useful for testing workflows before larger models.'
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
    id: 'llama32-1b-webllm-reference',
    name: 'Llama 3.2 1B WebLLM Reference',
    purpose: 'chat',
    category: 'chat',
    provider: 'browser-webllm',
    engine: 'webllm',
    task: 'chat-completion',
    browserModel: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    backend: 'webgpu',
    dtype: 'q4f16_1',
    local: true,
    pull: '',
    size: '~879 MB VRAM',
    quality: 'webgpu',
    notes: 'Kept as a future WebLLM target. Current MVP uses Transformers.js first for WebGPU/WebCPU fallback.'
  },
  {
    id: 'whisper-tiny-browser',
    name: 'Whisper Tiny Browser',
    purpose: 'speech-to-text',
    category: 'audio',
    provider: 'browser',
    engine: 'transformersjs',
    task: 'automatic-speech-recognition',
    browserModel: 'Xenova/whisper-tiny',
    backend: 'auto',
    dtype: 'q8',
    local: true,
    pull: '',
    size: '~150 MB',
    quality: 'tiny',
    notes: 'Speech-to-text browser target for the next audio iteration.'
  },
  {
    id: 'kokoro-82m-browser',
    name: 'Kokoro 82M Browser',
    purpose: 'text-to-speech',
    category: 'audio',
    provider: 'browser',
    engine: 'transformersjs',
    task: 'text-to-speech',
    browserModel: 'onnx-community/Kokoro-82M-v1.0-ONNX',
    backend: 'auto',
    dtype: 'q8',
    local: true,
    pull: '',
    size: '~326 MB',
    quality: 'small',
    notes: 'Text-to-speech browser target for the next audio iteration.'
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
