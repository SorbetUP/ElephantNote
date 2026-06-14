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
  },
  {
    id: 'ocr',
    label: 'OCR',
    description: 'Extract text from images and scanned documents.',
    purposes: ['ocr']
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
  'ocr',
  'speech-to-text',
  'text-to-speech'
])

export { ATOMIC_AI_FEATURES } from './atomicAiEngine'

export const ATOMIC_MODEL_CATALOG = Object.freeze([
  {
    id: 'smollm2-node-llama-cpp',
    name: 'SmolLM2 135M GGUF',
    purpose: 'embedding',
    category: 'embedding',
    provider: 'node-llama-cpp',
    engine: 'node-llama-cpp',
    task: 'embedding',
    model: 'hf:bartowski/SmolLM2-135M-Instruct-GGUF:Q4_K_M',
    uri: 'hf:bartowski/SmolLM2-135M-Instruct-GGUF:Q4_K_M',
    fileName: 'hf_bartowski_SmolLM2-135M-Instruct.Q4_K_M.gguf',
    local: true,
    pull: 'hf:bartowski/SmolLM2-135M-Instruct-GGUF:Q4_K_M',
    size: '~100 MB',
    quality: 'smoke',
    notes: 'Local GGUF model downloaded and loaded through node-llama-cpp. Used to prove note embedding search end-to-end.'
  },
  {
    id: 'smollm2-node-llama-cpp-chat',
    name: 'SmolLM2 135M GGUF Chat',
    purpose: 'chat',
    category: 'chat',
    provider: 'node-llama-cpp',
    engine: 'node-llama-cpp',
    task: 'chat-completion',
    model: 'hf:bartowski/SmolLM2-135M-Instruct-GGUF:Q4_K_M',
    uri: 'hf:bartowski/SmolLM2-135M-Instruct-GGUF:Q4_K_M',
    fileName: 'hf_bartowski_SmolLM2-135M-Instruct.Q4_K_M.gguf',
    local: true,
    pull: 'hf:bartowski/SmolLM2-135M-Instruct-GGUF:Q4_K_M',
    size: '~100 MB',
    quality: 'local',
    notes: 'Local chat response through node-llama-cpp. Small model selected for fast install and validation.'
  },
  {
    id: 'local-tesseract-ocr',
    name: 'Tesseract Local OCR',
    purpose: 'ocr',
    category: 'ocr',
    provider: 'local-ocr',
    engine: 'tesseract',
    task: 'ocr',
    local: true,
    size: 'system binary',
    quality: 'local',
    notes: 'Local image-to-text OCR through the Tesseract command line runtime.'
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
    notes: 'Reference-only browser target kept out of the default local AI setup. Current local text runtime is node-llama-cpp.'
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

export {
  ATOMIC_PLUGIN_MANIFESTS,
  EXTENSION_ACTION_STATUS,
  EXTENSION_PLUGIN_IDS,
  EXTENSION_PLUGIN_RUNTIMES,
  EXTENSION_TASK_ACTIONS,
  PROGRAMMATIC_TASK_TEMPLATES,
  createDefaultPluginState,
  createDefaultTaskState,
  createTaskRunResult,
  createTaskStepResult,
  isExecutableTaskAction,
  mergePluginState,
  mergeTaskState,
  normalizePluginManifest,
  normalizeProgrammaticTask,
  resolvePluginRuntime,
  updatePluginState,
  updateTaskState
} from './extensions'

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
