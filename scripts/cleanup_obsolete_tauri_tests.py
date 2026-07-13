from pathlib import Path

OBSOLETE = [
    'tests/elephant/unit/bootstrapRenderer.spec.js',
    'tests/elephant/unit/chatViewHelpers.spec.js',
    'tests/elephant/unit/electronLocalShortcutShim.spec.js',
    'tests/elephant/unit/fileSystemUpload.spec.js',
    'tests/elephant/unit/googleKeepImport.spec.js',
    'tests/elephant/unit/i18n.spec.js',
    'tests/elephant/unit/imageSource.spec.js',
    'tests/elephant/unit/lanPeerProtocol.spec.js',
    'tests/elephant/unit/llamaWarningFilter.spec.js',
    'tests/elephant/unit/loadImageAsync.spec.js',
    'tests/elephant/unit/logging.spec.js',
    'tests/elephant/unit/modelLibraryIpc.spec.js',
    'tests/elephant/unit/modelsViewHelpers.spec.js',
    'tests/elephant/unit/modelsViewRender.spec.js',
    'tests/elephant/unit/nodeLlamaCppRuntime.spec.js',
    'tests/elephant/unit/nodePathShim.spec.js',
    'tests/elephant/unit/noteGraphHelpers.spec.js',
    'tests/elephant/unit/notification.spec.js',
    'tests/elephant/unit/plainObject.spec.js',
    'tests/elephant/unit/portablePreferences.spec.js',
    'tests/elephant/unit/ragChatPrompt.spec.js',
    'tests/elephant/unit/rcloneArgs.spec.js',
    'tests/elephant/unit/rcloneManager.spec.js',
    'tests/elephant/unit/rcloneProductionFlow.spec.js',
    'tests/elephant/unit/rcloneVaultEngine.spec.js',
    'tests/elephant/unit/resolveRendererRoutes.spec.js',
    'tests/elephant/unit/runtimeBridge.spec.js',
    'tests/elephant/unit/semanticGraphViewHelpers.spec.js',
    'tests/elephant/unit/settingsModelHelpers.spec.js',
    'tests/elephant/unit/tauriWindowCommands.spec.js',
    'tests/elephant/unit/vaultStore.spec.js',
    'tests/elephant/unit/wikiAsyncRace.spec.js',
    'tests/elephant/unit/wikiFolderRace.spec.js',
    'tests/elephant/unit/wikiViewHelpers.spec.js',
    'tests/elephant/unit/wikiViewRender.spec.js',
    'tests/elephant/unit/windowState.spec.js',
    'tests/elephant/unit/workflowImportSearch.spec.js',
    'tests/elephant/unit/search/searchIpc.spec.js',
]

for relative in OBSOLETE:
    path = Path(relative)
    if path.exists():
        path.unlink()

Path('tests/elephant/unit/aiProviders.spec.js').write_text("""import { describe, expect, it } from 'vitest'
import {
  ELEPHANTNOTE_AI_PRESETS,
  createAiRequestBody,
  extractAiResponseText,
  normalizeAiConfig,
  normalizeAiEndpoint,
  resolveAiEndpoint
} from 'common/elephantnote/aiProviders'

describe('ElephantNote AI providers', () => {
  it('accepts IP and port endpoints without a scheme', () => {
    expect(normalizeAiEndpoint('192.168.1.25:11434/api/chat')).toBe('http://192.168.1.25:11434/api/chat')
    expect(normalizeAiEndpoint('localhost:1234/v1/chat/completions')).toBe('http://localhost:1234/v1/chat/completions')
  })

  it('normalizes Ollama base URLs to the chat API route', () => {
    expect(resolveAiEndpoint({ transport: 'ollama', endpoint: 'http://127.0.0.1:11434' })).toBe('http://127.0.0.1:11434/api/chat')
    expect(resolveAiEndpoint({ transport: 'ollama', endpoint: '127.0.0.1:11434/api/chat' })).toBe('http://127.0.0.1:11434/api/chat')
  })

  it('uses the Tauri Rust local runtime by default', () => {
    expect(normalizeAiConfig({})).toMatchObject({
      preset: 'tauriRustLocal',
      transport: 'tauri-rust',
      endpoint: ELEPHANTNOTE_AI_PRESETS.tauriRustLocal.endpoint
    })
    expect(resolveAiEndpoint({ transport: 'tauri-rust', endpoint: '' })).toBe('tauri-rust://local')
  })

  it('migrates removed local presets and preserves supported remote presets', () => {
    expect(normalizeAiConfig({ preset: 'nodeLlamaCpp' })).toMatchObject({
      preset: 'tauriRustLocal',
      transport: 'tauri-rust',
      endpoint: ELEPHANTNOTE_AI_PRESETS.tauriRustLocal.endpoint
    })
    expect(normalizeAiConfig({ preset: 'mlx' })).toMatchObject({
      preset: 'mlx',
      transport: 'openai-compatible'
    })
    expect(normalizeAiConfig({ preset: 'openrouter' })).toMatchObject({
      preset: 'openrouter',
      transport: 'openai-compatible'
    })
    expect(normalizeAiConfig({ preset: 'codex' })).toMatchObject({
      preset: 'codex',
      transport: 'openai-compatible'
    })
    expect(normalizeAiConfig({ enabled: false })).not.toHaveProperty('enabled')
  })

  it('creates provider request bodies and extracts common response shapes', () => {
    const messages = [{ role: 'user', content: 'Hello' }]
    expect(createAiRequestBody({ transport: 'node-llama-cpp', model: 'local.gguf', messages })).toEqual({
      model: 'local.gguf',
      messages,
      stream: false
    })
    expect(createAiRequestBody({ transport: 'ollama', model: 'llama3.2', messages })).toEqual({
      model: 'llama3.2',
      messages,
      stream: false
    })
    expect(extractAiResponseText({ message: { content: 'Ollama response' } })).toBe('Ollama response')
    expect(extractAiResponseText({ choices: [{ message: { content: 'OpenAI response' } }] })).toBe('OpenAI response')
  })
})
""")

Path('tests/elephant/unit/aiSetup.spec.js').write_text("""import { describe, expect, it } from 'vitest'
import { ATOMIC_MODEL_CATALOG } from 'common/elephantnote/atomicWorkspace'
import {
  createSelectionPatchForModel,
  getModelRuntimeName,
  getRecommendedSetupModels,
  isRunnableSetupModel,
  isSetupModelInstalled
} from 'common/elephantnote/aiSetup'

describe('AI setup workflow helpers', () => {
  it('chooses runnable Tauri Rust defaults for embeddings and chat', () => {
    const recommended = getRecommendedSetupModels(ATOMIC_MODEL_CATALOG, 'tauri-rust')

    expect(recommended.embedding).toMatchObject({
      id: 'smollm2-node-llama-cpp',
      provider: 'tauri-rust',
      task: 'embedding'
    })
    expect(recommended.chat).toMatchObject({
      id: 'smollm2-node-llama-cpp-chat',
      provider: 'tauri-rust',
      task: 'chat-completion'
    })
    expect(recommended.ocr).toMatchObject({
      id: 'local-tesseract-ocr',
      provider: 'local-ocr',
      task: 'ocr'
    })
    expect(isRunnableSetupModel(recommended.embedding)).toBe(true)
    expect(isRunnableSetupModel(recommended.chat)).toBe(true)
    expect(isRunnableSetupModel(recommended.ocr)).toBe(true)
  })

  it('stores model slots with stable catalog ids, not runtime ids', () => {
    const model = ATOMIC_MODEL_CATALOG.find((item) => item.id === 'smollm2-node-llama-cpp')

    expect(getModelRuntimeName(model)).toBe('hf:bartowski/SmolLM2-135M-Instruct-GGUF:Q4_K_M')
    expect(createSelectionPatchForModel(model)).toEqual({
      embedding: 'smollm2-node-llama-cpp'
    })
  })

  it('recognizes installed Tauri Rust models by runtime name', () => {
    const embedding = ATOMIC_MODEL_CATALOG.find((item) => item.id === 'smollm2-node-llama-cpp')
    const chat = ATOMIC_MODEL_CATALOG.find((item) => item.id === 'smollm2-node-llama-cpp-chat')

    expect(isSetupModelInstalled(embedding, [
      { id: 'hf_bartowski_SmolLM2-135M-Instruct.Q4_K_M.gguf', model: 'hf:bartowski/SmolLM2-135M-Instruct-GGUF:Q4_K_M' }
    ])).toBe(true)
    expect(isSetupModelInstalled(chat, [
      { id: 'smollm2-node-llama-cpp-chat', provider: 'tauri-rust' }
    ])).toBe(true)
  })
})
""")

runtime_path = Path('tests/elephant/unit/autoLlamaRuntime.spec.js')
runtime = runtime_path.read_text()
runtime = runtime.replace("it('chooses the node runtime outside the browser'", "it('uses the portable WASM runtime when the legacy Node runtime is disabled'")
runtime = runtime.replace("engine: 'node-llama-cpp'", "engine: 'wasm'", 1)
runtime = runtime.replace("text: 'node chat ok'", "text: 'wasm chat ok'", 1)
runtime = runtime.replace("vector: [1, 2, 3]", "vector: [7, 8, 9]", 1)
runtime_path.write_text(runtime)

editor_path = Path('tests/elephant/unit/noteEditorHostImageLinks.spec.js')
editor = editor_path.read_text()
editor = editor.replace(
    "expect(source).toContain('const assetMarkdownSource = (targetPath) => toMarkdownImageSource(targetPath, store.activeVault?.path || currentNoteDirectory.value)')",
    "expect(source).toContain('const assetMarkdownSource = (targetPath) =>')\n    expect(source).toContain('toMarkdownImageSource(targetPath, store.activeVault?.path || currentNoteDirectory.value)')"
)
editor = editor.replace("const openExcalidrawFromImage = async(src) => {", "const openExcalidrawFromImage = async (src) => {")
editor_path.write_text(editor)

Path('tests/app/unit/elephantnote/domainClients.spec.js').write_text("""import { describe, expect, it, vi } from 'vitest'
import { ELEPHANTNOTE_API_ACTIONS as API } from 'common/elephantnote/apiActions'
import { createDomainClients } from '../../../../Elephant/frontend/app/services/elephantnoteClient/domainClients.js'

const createCall = ({ chatResults = [] } = {}) => {
  let chatIndex = 0
  const call = vi.fn(async (action) => {
    if (action === API.SEARCH_REBUILD) return { ok: true }
    if (action === API.RAG_CHAT) {
      const next = chatResults[chatIndex] || { answer: 'empty', citations: [] }
      chatIndex += 1
      return next
    }
    return { ok: true }
  })
  return { call }
}

const countAction = (call, action) => call.mock.calls.filter(([name]) => name === action).length
const createClients = (call) => createDomainClients(call, () => ({ describeApi: vi.fn(), callApi: vi.fn() }))

describe('domain clients chat search behavior', () => {
  it('delegates indexing and retrieval to the Rust RAG command', async () => {
    const { call } = createCall({
      chatResults: [
        { answer: 'first answer', citations: [{ path: 'A.md' }] },
        { answer: 'second answer', citations: [{ path: 'B.md' }] }
      ]
    })
    const clients = createClients(call)

    await clients.rag.chat('first')
    await clients.rag.chat('second')

    expect(countAction(call, API.RAG_CHAT)).toBe(2)
    expect(countAction(call, API.SEARCH_INIT_VAULT)).toBe(0)
  })

  it('does not rebuild chat search when the model already produced an answer', async () => {
    const { call } = createCall({ chatResults: [{ answer: 'first answer', citations: [] }, { answer: 'second answer', citations: [] }] })
    const clients = createClients(call)
    await clients.rag.chat('first')
    await clients.rag.chat('second')
    expect(countAction(call, API.SEARCH_REBUILD)).toBe(0)
  })

  it('forwards conversation history to rag chat requests', async () => {
    const { call } = createCall({ chatResults: [{ answer: 'context aware answer', citations: [] }] })
    const clients = createClients(call)
    await clients.rag.chat({
      message: 'What about the follow-up?',
      limit: 6,
      messages: [
        { role: 'user', content: 'What is the plan?' },
        { role: 'assistant', content: 'Ship the semantic graph.' },
        { role: 'user', content: 'What about the follow-up?' }
      ]
    })
    expect(call).toHaveBeenCalledWith(API.RAG_CHAT, expect.objectContaining({
      message: 'What about the follow-up?', limit: 6, messages: expect.any(Array)
    }))
  })
})
""")

Path('tests/app/unit/specs/main/elephantnote/chatClient.spec.js').write_text("""import { describe, expect, it } from 'vitest'
import { createDomainClients } from 'elephant-front/services/elephantnoteClient/domainClients'
import { ELEPHANTNOTE_API_ACTIONS as API } from 'common/elephantnote/apiActions'

const makeClient = (handler) => {
  const calls = []
  const call = async (action, payload = {}) => {
    calls.push({ action, payload })
    return handler(action)
  }
  return { calls, clients: createDomainClients(call, () => ({})) }
}

describe('RAG chat client', () => {
  it('delegates vault lookup and retrieval to the Rust RAG command', async () => {
    const { calls, clients } = makeClient((action) => {
      if (action === API.RAG_CHAT) return { answer: 'ok', citations: [{ path: 'A.md' }] }
      return {}
    })

    await clients.rag.chat('question', 4)

    expect(calls).toEqual([
      { action: API.RAG_CHAT, payload: { message: 'question', limit: 4, messages: [] } }
    ])
  })

  it('returns the first answer without a frontend rebuild retry', async () => {
    let ragCalls = 0
    const { calls, clients } = makeClient((action) => {
      if (action === API.RAG_CHAT) {
        ragCalls += 1
        return ragCalls === 1
          ? { answer: 'no citations', citations: [] }
          : { answer: 'ok', citations: [{ path: 'B.md' }] }
      }
      return {}
    })

    const result = await clients.rag.chat('semantic question', 8)

    expect(result.answer).toBe('no citations')
    expect(calls.map((entry) => entry.action)).toEqual([API.RAG_CHAT])
  })
})
""")

print(f'Removed {len(OBSOLETE)} obsolete Electron-era test files and refreshed Tauri contracts.')
