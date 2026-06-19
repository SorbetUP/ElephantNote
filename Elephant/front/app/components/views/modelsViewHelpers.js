import { ATOMIC_MODEL_CATALOG, createDefaultModelSelection } from 'common/elephantnote/atomicWorkspace'
import { AI_SETUP_RECOMMENDED_IDS, isRunnableSetupModel } from 'common/elephantnote/aiSetup'

export const MODEL_ROLES = Object.freeze([
  { id: 'embedding', label: 'Embedding', hint: 'Semantic search and note graph retrieval' },
  { id: 'chat', label: 'Chat', hint: 'Assistant, RAG chat and agent bridging' },
  { id: 'ocr', label: 'OCR', hint: 'Extract text from images and scans' }
])

export const ROLE_IDS = Object.freeze(MODEL_ROLES.map((role) => role.id))

export const USE_NONE = 'none'

export const formatBytes = (value) => {
  const bytes = Number(value) || 0
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  const isWhole = Math.abs(size - Math.round(size)) < 0.05
  const digits = unit === 0 || size >= 100 || isWhole ? 0 : 1
  return `${size.toFixed(digits)} ${units[unit]}`
}

export const formatCompactCount = (value) => {
  const count = Number(value) || 0
  if (count >= 1000000) return `${(count / 1000000).toFixed(count >= 10000000 ? 0 : 1)}M`
  if (count >= 1000) return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}K`
  return `${count}`
}

export const resolveModelId = (model) => {
  model = model || {}
  return String(
    model?.id ||
    model?.repoId ||
    model?.modelId ||
    model?.modelPath ||
    model?.path ||
    model?.name ||
    ''
  ).trim()
}

export const resolveModelName = (model) => {
  model = model || {}
  return String(model.name || model.id || model.repoId || model.modelId || 'Untitled model').trim()
}

export const resolveModelAuthor = (model) => {
  model = model || {}
  const fromAuthor = String(model.author || '').trim()
  if (fromAuthor) return fromAuthor
  const repoId = String(model.repoId || model.id || '').trim()
  if (repoId.includes('/')) return repoId.split('/')[0]
  return ''
}

export const isLocalModel = (model) => {
  model = model || {}
  if (model.provider === 'huggingface' && !model.path && !model.modelPath) return false
  return Boolean(model.path || model.modelPath || model.local || model.provider === 'local-ocr')
}

export const isRemoteModel = (model) => {
  model = model || {}
  if (isLocalModel(model)) return false
  return Boolean(
    model.provider === 'huggingface' ||
    model.repoId ||
    model.source === 'huggingface' ||
    model.pull ||
    model.uri
  )
}

export const isRunnableModel = (model) => isRunnableSetupModel(model)

export const isDownloading = (model = {}, downloads = new Map()) => {
  model = model || {}
  const id = resolveModelId(model)
  if (!id) return false
  return downloads.has(id)
}

export const downloadProgress = (model = {}, downloads = new Map()) => {
  model = model || {}
  const id = resolveModelId(model)
  if (!id) return 0
  return Number(downloads.get(id)?.percent || 0)
}

export const downloadMessage = (model = {}, downloads = new Map()) => {
  model = model || {}
  const id = resolveModelId(model)
  if (!id) return ''
  return String(downloads.get(id)?.message || '')
}

export const getRoleAssignments = (model = {}, selection = {}) => {
  model = model || {}
  const id = resolveModelId(model)
  if (!id) return []
  return ROLE_IDS.filter((role) => selection[role] === id)
}

export const isAssignedToRole = (model = {}, role = '', selection = {}) => {
  model = model || {}
  const id = resolveModelId(model)
  if (!id || !role) return false
  return selection[role] === id
}

export const assignRole = (selection = {}, role = '', model = {}) => {
  model = model || {}
  if (!ROLE_IDS.includes(role)) return { ...selection }
  const id = resolveModelId(model)
  if (!id) return { ...selection }
  return { ...selection, [role]: id }
}

export const clearRoleAssignment = (selection = {}, model = {}) => {
  model = model || {}
  const id = resolveModelId(model)
  if (!id) return { ...selection }
  const next = { ...selection }
  for (const role of ROLE_IDS) {
    if (next[role] === id) next[role] = ''
  }
  return next
}

export const clearSpecificRole = (selection = {}, role = '') => {
  if (!ROLE_IDS.includes(role)) return { ...selection }
  return { ...selection, [role]: '' }
}

export const applyRoleChoice = (selection = {}, role = '', model = {}, choice = '') => {
  model = model || {}
  if (choice === USE_NONE) return clearRoleAssignment(selection, model)
  if (!role || !ROLE_IDS.includes(role)) return { ...selection }
  if (!model || !resolveModelId(model)) return { ...selection }
  return assignRole(selection, role, model)
}

export const countAssignedRoles = (selection = {}) =>
  ROLE_IDS.reduce((count, role) => count + (selection[role] ? 1 : 0), 0)

export const getAssignedModelForRole = (role = '', catalog = [], selection = {}) => {
  const id = selection[role]
  if (!id) return null
  return catalog.find((model) => resolveModelId(model) === id) || null
}

export const normalizeSelection = (selection = {}) => ({
  ...createDefaultModelSelection(),
  ...(selection && typeof selection === 'object' ? selection : {})
})

export const getModelSummary = (model) => {
  model = model || {}
  return String(
    model.summary ||
    model.notes ||
    model.pipelineTag ||
    model.message ||
    model.repoId ||
    'No description available.'
  ).trim()
}

export const getModelSizeLabel = (model) => {
  model = model || {}
  const fromBytes = formatBytes(model.sizeBytes || model.size)
  if (fromBytes) return fromBytes
  return String(model.size || '').trim()
}

export const getModelTags = (model) => {
  model = model || {}
  const tags = Array.isArray(model.tags) ? model.tags : []
  const pipeline = model.pipelineTag ? [model.pipelineTag] : []
  const purpose = model.purpose && model.purpose !== 'chat' ? [model.purpose] : []
  return Array.from(new Set([...pipeline, ...purpose, ...tags]))
    .filter(Boolean)
    .slice(0, 4)
}

export const filterModelsByName = (models = [], query = '') => {
  const term = String(query || '').trim().toLowerCase()
  if (!term) return [...models]
  return models.filter((model) => {
    const haystack = [
      model.name,
      model.id,
      model.repoId,
      model.modelId,
      model.author,
      model.pipelineTag,
      ...(Array.isArray(model.tags) ? model.tags : [])
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(term)
  })
}

export const sortByPopularity = (models = []) =>
  [...models].sort((a, b) => {
    const aDownloads = Number(a.downloads || 0)
    const bDownloads = Number(b.downloads || 0)
    if (bDownloads !== aDownloads) return bDownloads - aDownloads
    const aLikes = Number(a.likes || 0)
    const bLikes = Number(b.likes || 0)
    if (bLikes !== aLikes) return bLikes - aLikes
    return String(a.name || '').localeCompare(String(b.name || ''))
  })

export const dedupeModelsById = (models = []) => {
  const seen = new Set()
  const result = []
  for (const model of models) {
    const id = resolveModelId(model)
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push(model)
  }
  return result
}

export const mergeLocalAndRemote = (local = [], remote = []) => {
  const merged = [...(Array.isArray(local) ? local : []), ...(Array.isArray(remote) ? remote : [])]
  return dedupeModelsById(merged)
}

export const getPopularModels = ({
  catalog = ATOMIC_MODEL_CATALOG,
  remote = [],
  limit = 12
} = {}) => {
  const runnable = catalog.filter(isRunnableModel)
  const merged = mergeLocalAndRemote(runnable, remote)
  return sortByPopularity(merged).slice(0, Number(limit) || 12)
}

export const getRecommendedModelId = (role = '') => {
  const ids = AI_SETUP_RECOMMENDED_IDS['node-llama-cpp'] || {}
  return ids[role] || ''
}

export const getRecommendedModel = (role = '', catalog = ATOMIC_MODEL_CATALOG) => {
  const id = getRecommendedModelId(role)
  if (!id) return null
  return catalog.find((model) => model.id === id) || null
}

export const buildStateBadge = (model = {}, selection = {}, downloads = new Map()) => {
  model = model || {}
  if (isDownloading(model, downloads)) return { tone: 'downloading', label: 'Downloading' }
  const roles = getRoleAssignments(model, selection)
  if (roles.length > 0) {
    return {
      tone: 'active',
      label: roles.length === 1 ? `Active · ${roles[0]}` : `Active · ${roles.length} roles`
    }
  }
  if (isLocalModel(model)) return { tone: 'installed', label: 'Installed' }
  if (isRemoteModel(model)) return { tone: 'available', label: 'Available' }
  return { tone: 'idle', label: 'Available' }
}

export const createInitialSelection = () => normalizeSelection({})

export const getUseMenuOptions = (model = {}, selection = {}) => {
  model = model || {}
  const assignedRoles = getRoleAssignments(model, selection)
  const options = MODEL_ROLES.map((role) => ({
    ...role,
    selected: assignedRoles.includes(role.id),
    recommended: getRecommendedModelId(role.id) === resolveModelId(model)
  }))
  return [
    ...options,
    {
      id: USE_NONE,
      label: 'None',
      hint: assignedRoles.length ? 'Unassign from every role' : 'Not in use',
      selected: assignedRoles.length === 0
    }
  ]
}

export const FORMAT_FILTERS = Object.freeze([
  { id: 'all', label: 'All' },
  { id: 'gguf', label: 'GGUF' },
  { id: 'mlx', label: 'MLX' },
  { id: 'onnx', label: 'ONNX' }
])

export const SOURCE_FILTERS = Object.freeze([
  { id: 'all', label: 'All' },
  { id: 'installed', label: 'Installed' },
  { id: 'local', label: 'Local' },
  { id: 'remote', label: 'Remote' }
])

export const SORT_OPTIONS = Object.freeze([
  { id: 'best', label: 'Best Match' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'updated', label: 'Recently Updated' },
  { id: 'likes', label: 'Likes' },
  { id: 'name', label: 'Name' }
])

export const getModelFormat = (model) => {
  model = model || {}
  const name = String(model.fileName || model.filename || model.name || model.id || '').toLowerCase()
  if (/\.gguf$/i.test(name) || /gguf/i.test(name)) return 'GGUF'
  if (/\.mlx/i.test(name) || /\bmlx\b/i.test(name)) return 'MLX'
  if (/\.onnx/i.test(name) || /\bonnx\b/i.test(name)) return 'ONNX'
  if (model.provider === 'local-ocr' || model.task === 'ocr') return 'OCR'
  return 'GGUF'
}

export const getModelQuantization = (model) => {
  model = model || {}
  const name = String(model.fileName || model.filename || model.name || model.id || '')
  const match = name.match(/q([0-9]+(?:_[a-z0-9_]+)*)/i)
  if (match) return `Q${match[1].toUpperCase()}`
  const dtype = String(model.dtype || '').toLowerCase()
  if (dtype) return dtype.toUpperCase()
  if (/f16|fp16/i.test(name)) return 'F16'
  if (/q8/i.test(name)) return 'Q8'
  return ''
}

export const getModelCapabilities = (model) => {
  model = model || {}
  const caps = new Set()
  const purpose = String(model.purpose || '').toLowerCase()
  const task = String(model.task || '').toLowerCase()
  const pipeline = String(model.pipelineTag || '').toLowerCase()
  const tags = Array.isArray(model.tags) ? model.tags.map((t) => String(t).toLowerCase()) : []

  if (purpose === 'chat' || task.includes('chat') || task.includes('text-generation') || pipeline.includes('text-generation')) caps.add('Chat')
  if (purpose === 'embedding' || task.includes('embedding')) caps.add('Embedding')
  if (purpose === 'ocr' || task.includes('ocr')) caps.add('OCR')
  if (purpose === 'speech-to-text' || task.includes('speech')) caps.add('Speech')
  if (purpose === 'text-to-speech') caps.add('TTS')
  if (tags.includes('vision') || tags.includes('vlm') || tags.includes('image')) caps.add('Vision')
  if (tags.includes('tool-use') || tags.includes('tools') || tags.includes('function-calling')) caps.add('Tool Use')
  if (purpose === 'agent') caps.add('Agent')

  if (caps.size === 0 && isRunnableModel(model)) caps.add('Chat')
  return Array.from(caps)
}

export const getModelUpdatedDate = (model) => {
  model = model || {}
  const raw = model.updatedAt || model.modifiedAt || model.lastModified || model.created_at || model.createdAt
  if (!raw) return ''
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

export const formatRelativeDate = (value = '', now = new Date()) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  if (diffDays < 0) return 'upcoming'
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return '1 day ago'
  if (diffDays < 30) return `${diffDays} days ago`
  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) return diffMonths === 1 ? '1 month ago' : `${diffMonths} months ago`
  const diffYears = Math.floor(diffDays / 365)
  return diffYears === 1 ? '1 year ago' : `${diffYears} years ago`
}

export const getModelSource = (model) => {
  model = model || {}
  if (isLocalModel(model)) return 'Local'
  if (isRemoteModel(model)) return 'Hugging Face'
  return model.provider || 'Unknown'
}

export const getModelLicense = (model) => {
  model = model || {}
  const card = model.cardData || {}
  return String(card.license || model.license || '').trim() || 'unknown'
}

export const getModelRuntime = (model) => {
  model = model || {}
  if (model.provider === 'node-llama-cpp') return 'llama.cpp'
  if (model.provider === 'browser-webllm' || model.engine === 'webllm') return 'WebLLM'
  if (model.provider === 'browser' || model.engine === 'transformersjs') return 'Transformers.js'
  if (model.provider === 'local-ocr' || model.engine === 'tesseract') return 'Tesseract'
  return model.engine || model.provider || 'llama.cpp'
}

export const getModelReadme = (model) => {
  model = model || {}
  const card = model.cardData || {}
  const description = String(
    card.description ||
    model.summary ||
    model.notes ||
    model.message ||
    ''
  ).trim()
  return {
    creator: resolveModelAuthor(model) || 'unknown',
    original: String(model.repoId || model.id || '').trim() || 'unknown',
    format: getModelFormat(model),
    runtime: getModelRuntime(model),
    license: getModelLicense(model),
    description: description || 'No description available for this model.'
  }
}

export const filterByFormat = (models = [], format = 'all') => {
  if (!format || format === 'all') return [...models]
  const target = format.toLowerCase()
  return models.filter((model) => getModelFormat(model).toLowerCase() === target)
}

export const filterBySource = (models = [], source = 'all') => {
  if (!source || source === 'all') return [...models]
  if (source === 'installed') return models.filter((m) => isLocalModel(m))
  if (source === 'local') return models.filter((m) => isLocalModel(m))
  if (source === 'remote') return models.filter((m) => isRemoteModel(m) && !isLocalModel(m))
  return [...models]
}

export const sortModels = (models = [], sort = 'best') => {
  const list = [...models]
  switch (sort) {
    case 'downloads':
      return list.sort((a, b) => Number(b.downloads || 0) - Number(a.downloads || 0))
    case 'likes':
      return list.sort((a, b) => Number(b.likes || 0) - Number(a.likes || 0))
    case 'updated':
      return list.sort((a, b) => {
        const aTime = new Date(a.updatedAt || a.modifiedAt || 0).getTime()
        const bTime = new Date(b.updatedAt || b.modifiedAt || 0).getTime()
        return bTime - aTime
      })
    case 'name':
      return list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
    case 'best':
    default:
      return sortByPopularity(list)
  }
}

export const applyCatalogFilters = ({
  models = [],
  query = '',
  format = 'all',
  source = 'all',
  sort = 'best'
} = {}) => {
  const byName = filterModelsByName(models, query)
  const byFormat = filterByFormat(byName, format)
  const bySource = filterBySource(byFormat, source)
  return sortModels(bySource, sort)
}

export const getDownloadOption = (model) => {
  model = model || {}
  const format = getModelFormat(model)
  const quantization = getModelQuantization(model)
  const sizeLabel = getModelSizeLabel(model)
  const fileName = String(model.fileName || model.filename || '').trim()
  const installed = isLocalModel(model)
  return {
    format,
    quantization,
    sizeLabel,
    fileName: fileName || resolveModelName(model),
    installed,
    status: installed
      ? 'Applicable model file already downloaded'
      : isRemoteModel(model)
        ? 'Available for download'
        : 'Local file'
  }
}
