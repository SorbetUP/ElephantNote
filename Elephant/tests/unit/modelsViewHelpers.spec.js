import { describe, expect, it } from 'vitest'
import {
  ATOMIC_MODEL_CATALOG,
  createDefaultModelSelection
} from 'common/elephantnote/atomicWorkspace'
import {
  MODEL_ROLES,
  ROLE_IDS,
  USE_NONE,
  FORMAT_FILTERS,
  SOURCE_FILTERS,
  SORT_OPTIONS,
  applyCatalogFilters,
  applyRoleChoice,
  assignRole,
  buildStateBadge,
  clearRoleAssignment,
  clearSpecificRole,
  countAssignedRoles,
  createInitialSelection,
  dedupeModelsById,
  downloadMessage,
  downloadProgress,
  filterByFormat,
  filterBySource,
  filterModelsByName,
  formatBytes,
  formatCompactCount,
  formatRelativeDate,
  getAssignedModelForRole,
  getDownloadOption,
  getModelCapabilities,
  getModelFormat,
  getModelLicense,
  getModelQuantization,
  getModelReadme,
  getModelRuntime,
  getModelSizeLabel,
  getModelSource,
  getModelSummary,
  getModelTags,
  getModelUpdatedDate,
  getPopularModels,
  getRecommendedModel,
  getRecommendedModelId,
  getRoleAssignments,
  getUseMenuOptions,
  isAssignedToRole,
  isDownloading,
  isLocalModel,
  isRemoteModel,
  isRunnableModel,
  mergeLocalAndRemote,
  normalizeSelection,
  resolveModelAuthor,
  resolveModelId,
  resolveModelName,
  sortByPopularity,
  sortModels
} from '../../front/app/components/views/modelsViewHelpers.js'

const SAMPLE_LOCAL = {
  id: 'smollm2-node-llama-cpp',
  name: 'SmolLM2 135M GGUF',
  provider: 'node-llama-cpp',
  task: 'embedding',
  purpose: 'embedding',
  path: '/tmp/models/smollm2.gguf',
  sizeBytes: 100 * 1024 * 1024,
  downloads: 1200,
  likes: 42
}

const SAMPLE_REMOTE = {
  id: 'Qwen/Qwen2-0.5B-Instruct',
  name: 'Qwen/Qwen2-0.5B-Instruct',
  provider: 'huggingface',
  repoId: 'Qwen/Qwen2-0.5B-Instruct',
  pipelineTag: 'text-generation',
  downloads: 50000,
  likes: 320,
  tags: ['gguf', 'qwen']
}

describe('modelsViewHelpers - formatting', () => {
  it('formats bytes into human readable sizes', () => {
    expect(formatBytes(0)).toBe('')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(100 * 1024 * 1024)).toBe('100 MB')
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2 GB')
  })

  it('formats compact download counts', () => {
    expect(formatCompactCount(0)).toBe('0')
    expect(formatCompactCount(999)).toBe('999')
    expect(formatCompactCount(1200)).toBe('1.2K')
    expect(formatCompactCount(25000)).toBe('25K')
    expect(formatCompactCount(2500000)).toBe('2.5M')
    expect(formatCompactCount(25000000)).toBe('25M')
  })

  it('resolves model name, id and author from partial data', () => {
    expect(resolveModelName({ id: 'Qwen/Qwen2' })).toBe('Qwen2')
    expect(resolveModelName({})).toBe('Untitled model')
    expect(resolveModelId({ repoId: 'Qwen/Qwen2' })).toBe('Qwen/Qwen2')
    expect(resolveModelId({})).toBe('')
    expect(resolveModelAuthor({ repoId: 'Qwen/Qwen2' })).toBe('Qwen')
    expect(resolveModelAuthor({ author: 'bartowski' })).toBe('bartowski')
    expect(resolveModelAuthor({})).toBe('')
  })
})

describe('modelsViewHelpers - model classification', () => {
  it('detects local models by path or local-only provider', () => {
    expect(isLocalModel(SAMPLE_LOCAL)).toBe(true)
    expect(isLocalModel({ provider: 'local-ocr', task: 'ocr' })).toBe(true)
    expect(isLocalModel(SAMPLE_REMOTE)).toBe(false)
    expect(isLocalModel({})).toBe(false)
  })

  it('detects remote huggingface models', () => {
    expect(isRemoteModel(SAMPLE_REMOTE)).toBe(true)
    expect(isRemoteModel({ provider: 'huggingface', repoId: 'a/b' })).toBe(true)
    expect(isRemoteModel(SAMPLE_LOCAL)).toBe(false)
    expect(isRemoteModel({})).toBe(false)
  })

  it('flags runnable setup models only', () => {
    expect(isRunnableModel(ATOMIC_MODEL_CATALOG[0])).toBe(true)
    expect(isRunnableModel({ provider: 'unknown', task: 'foo' })).toBe(false)
  })
})

describe('modelsViewHelpers - download progress', () => {
  it('reads download state from a map keyed by model id', () => {
    const downloads = new Map([['abc', { percent: 42, message: 'downloading' }]])
    expect(isDownloading({ id: 'abc' }, downloads)).toBe(true)
    expect(isDownloading({ id: 'xyz' }, downloads)).toBe(false)
    expect(downloadProgress({ id: 'abc' }, downloads)).toBe(42)
    expect(downloadProgress({ id: 'xyz' }, downloads)).toBe(0)
    expect(downloadMessage({ id: 'abc' }, downloads)).toBe('downloading')
    expect(downloadMessage({ id: 'xyz' }, downloads)).toBe('')
  })
})

describe('modelsViewHelpers - role selection', () => {
  it('exposes the three user-facing roles embedding, chat and ocr', () => {
    expect(ROLE_IDS).toEqual(['embedding', 'chat', 'ocr'])
    expect(MODEL_ROLES.map((r) => r.id)).toEqual(['embedding', 'chat', 'ocr'])
  })

  it('normalizes a selection against the default purpose map', () => {
    const selection = normalizeSelection({ chat: 'model-a' })
    expect(selection.chat).toBe('model-a')
    expect(selection.embedding).toBe('')
    expect(selection.ocr).toBe('')
    expect(selection.tagging).toBe('')
  })

  it('creates an initial empty selection', () => {
    const initial = createInitialSelection()
    expect(initial).toEqual(createDefaultModelSelection())
    expect(countAssignedRoles(initial)).toBe(0)
  })

  it('assigns a role to a model and replaces the previous model for that role', () => {
    const base = createInitialSelection()
    const afterFirst = assignRole(base, 'chat', { id: 'model-a' })
    expect(afterFirst.chat).toBe('model-a')
    const afterSecond = assignRole(afterFirst, 'chat', { id: 'model-b' })
    expect(afterSecond.chat).toBe('model-b')
    expect(getRoleAssignments({ id: 'model-a' }, afterSecond)).toEqual([])
    expect(getRoleAssignments({ id: 'model-b' }, afterSecond)).toEqual(['chat'])
  })

  it('clears all role assignments for a model', () => {
    let selection = createInitialSelection()
    selection = assignRole(selection, 'embedding', { id: 'shared-model' })
    selection = assignRole(selection, 'chat', { id: 'shared-model' })
    selection = assignRole(selection, 'ocr', { id: 'shared-model' })
    expect(getRoleAssignments({ id: 'shared-model' }, selection)).toEqual([
      'embedding',
      'chat',
      'ocr'
    ])
    const cleared = clearRoleAssignment(selection, { id: 'shared-model' })
    expect(getRoleAssignments({ id: 'shared-model' }, cleared)).toEqual([])
    expect(countAssignedRoles(cleared)).toBe(0)
  })

  it('clears a specific role without touching the others', () => {
    let selection = createInitialSelection()
    selection = assignRole(selection, 'embedding', { id: 'model-a' })
    selection = assignRole(selection, 'chat', { id: 'model-b' })
    selection = clearSpecificRole(selection, 'chat')
    expect(selection.chat).toBe('')
    expect(selection.embedding).toBe('model-a')
  })

  it('applies a role choice and treats none as a full unassign', () => {
    let selection = createInitialSelection()
    selection = applyRoleChoice(selection, 'chat', { id: 'model-a' }, 'chat')
    expect(selection.chat).toBe('model-a')
    selection = applyRoleChoice(selection, 'chat', { id: 'model-a' }, USE_NONE)
    expect(selection.chat).toBe('')
    expect(applyRoleChoice(selection, 'unknown', { id: 'x' }, 'unknown')).toEqual(selection)
  })

  it('answers whether a model is assigned to a role', () => {
    const selection = assignRole(createInitialSelection(), 'ocr', { id: 'model-a' })
    expect(isAssignedToRole({ id: 'model-a' }, 'ocr', selection)).toBe(true)
    expect(isAssignedToRole({ id: 'model-a' }, 'chat', selection)).toBe(false)
    expect(isAssignedToRole({}, 'ocr', selection)).toBe(false)
  })

  it('resolves the assigned model for a role from a catalog', () => {
    const catalog = [SAMPLE_LOCAL, { id: 'chat-model', purpose: 'chat' }]
    const selection = assignRole(createInitialSelection(), 'embedding', SAMPLE_LOCAL)
    expect(getAssignedModelForRole('embedding', catalog, selection)).toEqual(SAMPLE_LOCAL)
    expect(getAssignedModelForRole('chat', catalog, selection)).toBeNull()
    expect(getAssignedModelForRole('embedding', catalog, createInitialSelection())).toBeNull()
  })

  it('builds the Use... menu options with selected and recommended flags', () => {
    const selection = assignRole(createInitialSelection(), 'chat', SAMPLE_LOCAL)
    const options = getUseMenuOptions(SAMPLE_LOCAL, selection)
    expect(options).toHaveLength(4)
    expect(options.map((o) => o.id)).toEqual(['embedding', 'chat', 'ocr', USE_NONE])
    expect(options.find((o) => o.id === 'chat').selected).toBe(true)
    expect(options.find((o) => o.id === 'embedding').selected).toBe(false)
    expect(options.find((o) => o.id === USE_NONE).selected).toBe(false)
  })

  it('marks the none option selected when no role is assigned', () => {
    const options = getUseMenuOptions(SAMPLE_LOCAL, createInitialSelection())
    expect(options.find((o) => o.id === USE_NONE).selected).toBe(true)
  })
})

describe('modelsViewHelpers - model display helpers', () => {
  it('builds a state badge with tone and label', () => {
    const downloading = buildStateBadge(
      { id: 'abc' },
      createInitialSelection(),
      new Map([['abc', { percent: 10 }]])
    )
    expect(downloading.tone).toBe('downloading')

    const active = buildStateBadge(
      SAMPLE_LOCAL,
      assignRole(createInitialSelection(), 'embedding', SAMPLE_LOCAL),
      new Map()
    )
    expect(active.tone).toBe('active')
    expect(active.label).toContain('embedding')

    const installed = buildStateBadge(SAMPLE_LOCAL, createInitialSelection(), new Map())
    expect(installed.tone).toBe('installed')

    const available = buildStateBadge(SAMPLE_REMOTE, createInitialSelection(), new Map())
    expect(available.tone).toBe('available')
  })

  it('summarizes a model from the first available descriptor', () => {
    expect(getModelSummary({ summary: 'A small model' })).toBe('A small model')
    expect(getModelSummary({ notes: 'notes here' })).toBe('notes here')
    expect(getModelSummary({ pipelineTag: 'text-generation' })).toBe('text-generation')
    expect(getModelSummary({})).toBe('No description available.')
  })

  it('returns a size label from bytes or a textual size', () => {
    expect(getModelSizeLabel({ sizeBytes: 2 * 1024 * 1024 })).toBe('2 MB')
    expect(getModelSizeLabel({ size: '~879 MB VRAM' })).toBe('~879 MB VRAM')
    expect(getModelSizeLabel({})).toBe('')
  })

  it('collects up to four tags from pipeline, purpose and tags', () => {
    const tags = getModelTags({
      pipelineTag: 'text-generation',
      purpose: 'chat',
      tags: ['gguf', 'qwen', 'extra', 'more', 'overflow']
    })
    expect(tags).toContain('text-generation')
    expect(tags).toContain('gguf')
    expect(tags.length).toBeLessThanOrEqual(4)
  })
})

describe('modelsViewHelpers - filtering and popularity', () => {
  it('filters models by name, repo id, author and tags', () => {
    const models = [SAMPLE_LOCAL, SAMPLE_REMOTE, { id: 'other', name: 'Other' }]
    expect(filterModelsByName(models, 'qwen')).toEqual([SAMPLE_REMOTE])
    expect(filterModelsByName(models, 'smollm')).toEqual([SAMPLE_LOCAL])
    expect(filterModelsByName(models, '')).toHaveLength(3)
    expect(filterModelsByName(models, 'missing')).toEqual([])
  })

  it('sorts models by downloads then likes then name', () => {
    const sorted = sortByPopularity([
      { id: 'a', name: 'A', downloads: 10, likes: 5 },
      { id: 'b', name: 'B', downloads: 100, likes: 2 },
      { id: 'c', name: 'C', downloads: 100, likes: 9 }
    ])
    expect(sorted.map((m) => m.id)).toEqual(['c', 'b', 'a'])
  })

  it('dedupes models by resolved id and drops unresolvable entries', () => {
    const deduped = dedupeModelsById([
      { id: 'x', name: 'one' },
      { id: 'x', name: 'two' },
      { id: 'y', name: 'three' }
    ])
    expect(dedupeModelsById).toBeTruthy()
    expect(dedupeModelsById([{ name: 'named' }, { id: 'x' }])).toHaveLength(2)
    expect(dedupeModelsById([{}, {}, { id: 'only' }])).toHaveLength(1)
    expect(deduped).toHaveLength(2)
    expect(deduped[0].name).toBe('one')
  })

  it('merges local and remote models without duplicates', () => {
    const merged = mergeLocalAndRemote(
      [{ id: 'shared', name: 'local' }],
      [{ id: 'shared', name: 'remote' }, { id: 'only-remote', name: 'remote-only' }]
    )
    expect(merged).toHaveLength(2)
    expect(merged.find((m) => m.id === 'shared').name).toBe('local')
  })

  it('returns popular runnable models sorted and limited', () => {
    const catalog = [
      { id: 'run-1', purpose: 'embedding', provider: 'node-llama-cpp', task: 'embedding', downloads: 5 },
      { id: 'run-2', purpose: 'chat', provider: 'node-llama-cpp', task: 'chat-completion', downloads: 50 },
      { id: 'nope', purpose: 'chat', provider: 'browser', task: 'chat-completion', downloads: 9999 }
    ]
    const remote = [{ id: 'run-3', provider: 'huggingface', repoId: 'a/b', downloads: 200 }]
    const popular = getPopularModels({ catalog, remote, limit: 2 })
    expect(popular).toHaveLength(2)
    expect(popular[0].id).toBe('run-3')
    expect(popular.find((m) => m.id === 'nope')).toBeUndefined()
  })
})

describe('modelsViewHelpers - recommended models', () => {
  it('returns the recommended model id per role from the node-llama-cpp preset', () => {
    expect(getRecommendedModelId('embedding')).toBe('smollm2-node-llama-cpp')
    expect(getRecommendedModelId('chat')).toBe('smollm2-node-llama-cpp-chat')
    expect(getRecommendedModelId('ocr')).toBe('local-tesseract-ocr')
    expect(getRecommendedModelId('unknown')).toBe('')
  })

  it('resolves the recommended model object from the catalog', () => {
    const recommended = getRecommendedModel('embedding', ATOMIC_MODEL_CATALOG)
    expect(recommended?.id).toBe('smollm2-node-llama-cpp')
    expect(getRecommendedModel('unknown', ATOMIC_MODEL_CATALOG)).toBeNull()
  })
})

describe('modelsViewHelpers - LM Studio style helpers', () => {
  it('exposes filter and sort option lists', () => {
    expect(FORMAT_FILTERS.map((f) => f.id)).toEqual(['all', 'gguf', 'mlx', 'onnx'])
    expect(SOURCE_FILTERS.map((f) => f.id)).toEqual(['all', 'installed', 'local', 'remote'])
    expect(SORT_OPTIONS.map((s) => s.id)).toContain('best')
    expect(SORT_OPTIONS.map((s) => s.id)).toContain('downloads')
  })

  it('detects model format from filename and name', () => {
    expect(getModelFormat({ fileName: 'model.Q4_K_M.gguf' })).toBe('GGUF')
    expect(getModelFormat({ name: 'Qwen-MLX-4bit' })).toBe('MLX')
    expect(getModelFormat({ fileName: 'model.onnx' })).toBe('ONNX')
    expect(getModelFormat({ provider: 'local-ocr', task: 'ocr' })).toBe('OCR')
    expect(getModelFormat({})).toBe('GGUF')
  })

  it('extracts quantization label from filename or dtype', () => {
    expect(getModelQuantization({ fileName: 'model.Q4_K_M.gguf' })).toBe('Q4_K_M')
    expect(getModelQuantization({ fileName: 'model.Q8.gguf' })).toBe('Q8')
    expect(getModelQuantization({ fileName: 'model.fp16.gguf' })).toBe('F16')
    expect(getModelQuantization({ dtype: 'q4f16_1' })).toBe('Q4F16_1')
    expect(getModelQuantization({})).toBe('')
  })

  it('derives capabilities from purpose, task, pipeline and tags', () => {
    expect(getModelCapabilities({ purpose: 'chat', task: 'chat-completion' })).toContain('Chat')
    expect(getModelCapabilities({ purpose: 'embedding' })).toEqual(['Embedding'])
    expect(getModelCapabilities({ provider: 'local-ocr', purpose: 'ocr' })).toEqual(['OCR'])
    expect(getModelCapabilities({ tags: ['vision', 'vlm'] })).toContain('Vision')
    expect(getModelCapabilities({ tags: ['tool-use'] })).toContain('Tool Use')
    expect(getModelCapabilities({ purpose: 'agent' })).toContain('Agent')
    expect(getModelCapabilities({})).toEqual([])
  })

  it('returns iso date and relative date for updated field', () => {
    const iso = '2024-01-15T10:00:00Z'
    expect(getModelUpdatedDate({ updatedAt: iso })).toBe('2024-01-15')
    expect(getModelUpdatedDate({})).toBe('')
    const now = new Date('2024-04-15T10:00:00Z')
    expect(formatRelativeDate(iso, now)).toBe('3 months ago')
    expect(formatRelativeDate('', now)).toBe('')
    expect(formatRelativeDate('2024-04-15T10:00:00Z', now)).toBe('today')
    expect(formatRelativeDate('2024-04-14T10:00:00Z', now)).toBe('1 day ago')
  })

  it('returns model source label and runtime name', () => {
    expect(getModelSource(SAMPLE_LOCAL)).toBe('Local')
    expect(getModelSource(SAMPLE_REMOTE)).toBe('Hugging Face')
    expect(getModelRuntime(SAMPLE_LOCAL)).toBe('llama.cpp')
    expect(getModelRuntime({ provider: 'browser-webllm' })).toBe('WebLLM')
    expect(getModelRuntime({ provider: 'local-ocr' })).toBe('Tesseract')
  })

  it('returns license from cardData or model', () => {
    expect(getModelLicense({ cardData: { license: 'apache-2.0' } })).toBe('apache-2.0')
    expect(getModelLicense({ license: 'mit' })).toBe('mit')
    expect(getModelLicense({})).toBe('unknown')
  })

  it('builds a readme descriptor object', () => {
    const readme = getModelReadme(SAMPLE_LOCAL)
    expect(readme).toMatchObject({
      creator: expect.any(String),
      original: SAMPLE_LOCAL.id,
      format: 'GGUF',
      runtime: 'llama.cpp',
      license: 'unknown'
    })
    expect(readme.description).toBeTruthy()
    const empty = getModelReadme({})
    expect(empty.description).toBe('No description available for this model.')
  })

  it('filters by format and source', () => {
    const models = [
      { id: 'a', fileName: 'a.gguf', path: '/x' },
      { id: 'b', name: 'b-mlx', repoId: 'b/b' },
      { id: 'c', fileName: 'c.onnx', repoId: 'c/c' }
    ]
    expect(filterByFormat(models, 'all')).toHaveLength(3)
    expect(filterByFormat(models, 'gguf')).toHaveLength(1)
    expect(filterByFormat(models, 'mlx')).toHaveLength(1)
    expect(filterBySource(models, 'all')).toHaveLength(3)
    expect(filterBySource(models, 'local')).toHaveLength(1)
    expect(filterBySource(models, 'remote')).toHaveLength(2)
    expect(filterBySource(models, 'installed')).toHaveLength(1)
  })

  it('sorts models by selected criterion', () => {
    const models = [
      { id: 'a', name: 'A', downloads: 5, likes: 1, updatedAt: '2024-01-01' },
      { id: 'b', name: 'B', downloads: 50, likes: 5, updatedAt: '2024-03-01' },
      { id: 'c', name: 'C', downloads: 10, likes: 10, updatedAt: '2024-02-01' }
    ]
    expect(sortModels(models, 'downloads')[0].id).toBe('b')
    expect(sortModels(models, 'likes')[0].id).toBe('c')
    expect(sortModels(models, 'updated')[0].id).toBe('b')
    expect(sortModels(models, 'name')[0].id).toBe('a')
    expect(sortModels(models, 'best')[0].id).toBe('b')
  })

  it('chains filters via applyCatalogFilters', () => {
    const models = [
      { id: 'a', name: 'Qwen GGUF', fileName: 'a.gguf', path: '/x', downloads: 1 },
      { id: 'b', name: 'Qwen MLX', repoId: 'b/b', downloads: 100 },
      { id: 'c', name: 'Other', fileName: 'c.gguf', repoId: 'c/c', downloads: 50 }
    ]
    const result = applyCatalogFilters({
      models,
      query: 'qwen',
      format: 'gguf',
      source: 'local',
      sort: 'downloads'
    })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('a')
  })

  it('builds a download option descriptor for installed and remote models', () => {
    const installed = getDownloadOption(SAMPLE_LOCAL)
    expect(installed).toMatchObject({
      format: 'GGUF',
      installed: true,
      status: 'Applicable model file already downloaded'
    })
    const remote = getDownloadOption(SAMPLE_REMOTE)
    expect(remote.installed).toBe(false)
    expect(remote.status).toBe('Available for download')
  })
})
