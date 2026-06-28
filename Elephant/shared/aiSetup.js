export const AI_SETUP_RUNTIME_TAURI_RUST = 'tauri-rust'
export const AI_SETUP_RUNTIME_NODE_LLAMA_CPP = 'node-llama-cpp'

export const AI_SETUP_RECOMMENDED_IDS = Object.freeze({
  'tauri-rust': Object.freeze({
    embedding: 'smollm2-node-llama-cpp',
    chat: 'smollm2-node-llama-cpp-chat',
    ocr: 'local-tesseract-ocr'
  }),
  'node-llama-cpp': Object.freeze({
    embedding: 'smollm2-node-llama-cpp',
    chat: 'smollm2-node-llama-cpp-chat',
    ocr: 'local-tesseract-ocr'
  })
})

export const getRecommendedSetupModels = (catalog = [], runtime = AI_SETUP_RUNTIME_TAURI_RUST) => {
  const ids = AI_SETUP_RECOMMENDED_IDS[runtime] || AI_SETUP_RECOMMENDED_IDS[AI_SETUP_RUNTIME_TAURI_RUST] || AI_SETUP_RECOMMENDED_IDS[AI_SETUP_RUNTIME_NODE_LLAMA_CPP]
  const findById = (id) => catalog.find((model) => model.id === id)
  const findFallback = (purpose) => catalog.find((model) => model.purpose === purpose && isRunnableSetupModel(model))
  return {
    embedding: findById(ids.embedding) || findFallback('embedding') || null,
    chat: findById(ids.chat) || findFallback('chat') || null,
    ocr: findById(ids.ocr) || findFallback('ocr') || null
  }
}

export const isRunnableSetupModel = (model = {}) => {
  if (model.provider === AI_SETUP_RUNTIME_TAURI_RUST || model.provider === AI_SETUP_RUNTIME_NODE_LLAMA_CPP) {
    return ['chat-completion', 'embedding', 'text-generation'].includes(model.task)
  }
  if (model.provider === 'local-ocr') {
    return model.task === 'ocr'
  }
  return false
}

export const getModelRuntimeName = (model = {}) => model.browserModel || model.model || model.pull || model.id || ''

export const createSelectionPatchForModel = (model = {}) => {
  if (!model.purpose || !model.id) return {}
  return { [model.purpose]: model.id }
}

export const isSetupModelInstalled = (model = {}, installedModels = []) => {
  const runtimeName = getModelRuntimeName(model)
  const expectedNames = new Set([
    model.id,
    runtimeName,
    model.fileName,
    model.uri,
    model.pull
  ].filter(Boolean))
  return installedModels.some((installed) => {
    const installedRuntimeName = installed.browserModel || installed.model || installed.name || installed.id
    return expectedNames.has(installed.id) || expectedNames.has(installedRuntimeName)
  })
}
