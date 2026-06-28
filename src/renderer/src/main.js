import './platform/bootstrapGlobals'
import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import bootstrapRenderer from './bootstrap'
import axios from './axios'
import pinia from './store'
import './assets/symbolIcon'
import { installTauriRuntimeBridge } from './platform/tauriRuntimeBridge'
import { installTauriFileUtilsPathGuards } from './platform/tauriFileUtilsPathGuards'
import { installTauriElephantNoteBridge } from './platform/tauriElephantNoteBridge'
import { installTauriSearchRuntimeGuards } from './platform/tauriSearchRuntimeGuards'
import { installPiProviderBridge } from './platform/piProviderInterface'
import { installTauriMarkTextSaveBridge } from './platform/tauriMarkTextSaveBridge'
import { installTauriLocalIpcBridge } from './platform/tauriLocalIpcBridge'
import { installSlashMenuDiagnostics } from './platform/slashMenuDiagnostics'
import { installWritingCommandBridge } from './platform/writingCommandBridge'
import { installExcalidrawMarkdownCleanup } from './platform/excalidrawMarkdownCleanup'
import { installExcalidrawImageRuntimeFixes } from './platform/excalidrawImageRuntimeFixes'
import { restorePortableWindowState, savePortableWindowState } from './platform/windowState'
import { installRendererDiagnostics, pushDiagnosticLog } from './platform/rendererDiagnostics'
import { installStoreDiagnostics } from './platform/storeDiagnostics'
import { installAddonSystem } from './addons'
import { appDataDir } from '@tauri-apps/api/path'

import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import en from 'element-plus/es/locale/lang/en'

import i18nPlugin from './i18n'

import services from './services/index'
import createRoutes from './router'
import { resolveRendererRoutes } from './router/resolveRendererRoutes'
import Main from './Main.vue'
import { installGraphRuntimeFixes } from 'elephant-front/runtime/graphRuntimeFixes'

import './assets/styles/index.css'
import './assets/styles/printService.css'
import 'elephant-front/styles/runtime-layout-fixes.css'

const ensurePathResolve = () => {
  window.path = window.path || {}
  const normalize = window.path.normalize || ((value = '') => String(value || '').split('\\').join('/'))
  const join = window.path.join || ((...parts) => normalize(parts.filter(Boolean).join('/')))
  if (typeof window.path.normalize !== 'function') window.path.normalize = normalize
  if (typeof window.path.join !== 'function') window.path.join = join
  if (typeof window.path.resolve !== 'function') window.path.resolve = (...parts) => join(...parts)
  if (typeof window.path.basename !== 'function') {
    window.path.basename = (value = '') => {
      const parts = normalize(value).split('/').filter(Boolean)
      return parts.at(-1) || ''
    }
  }
  if (typeof window.path.dirname !== 'function') {
    window.path.dirname = (value = '') => {
      const parts = normalize(value).split('/').filter(Boolean)
      if (parts.length <= 1) return normalize(value).startsWith('/') ? '/' : '.'
      return `${normalize(value).startsWith('/') ? '/' : ''}${parts.slice(0, -1).join('/')}`
    }
  }
  if (typeof window.path.isAbsolute !== 'function') {
    window.path.isAbsolute = (value = '') => normalize(value).startsWith('/')
  }
  if (typeof window.path.relative !== 'function') {
    window.path.relative = (from = '', to = '') => {
      const fromParts = normalize(from).split('/').filter(Boolean)
      const toParts = normalize(to).split('/').filter(Boolean)
      while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
        fromParts.shift()
        toParts.shift()
      }
      return [...fromParts.map(() => '..'), ...toParts].join('/') || ''
    }
  }
}

const clearBootstrapFileUtilsFallbackForTauri = () => {
  if (window.__TAURI__ && window.fileUtils?.__elephantnoteBootstrapFallback) {
    delete window.fileUtils
  }
}

const normalizeSearchPath = (value = '') => String(value || '').replace(/\\/g, '/').split('/').filter(Boolean).join('/')

const titleFromPath = (path = '') => (normalizeSearchPath(path).split('/').pop() || 'Concept').replace(/\.md$/i, '')

const installTauriSearchConceptFallback = (target = globalThis) => {
  if (!target.__TAURI__ || !target.elephantnote?.search || typeof target.elephantnote.search.concepts === 'function') {
    return false
  }

  target.elephantnote.search.concepts = async(params = {}) => {
    const query = String(params.query || params.q || '').trim()
    const limit = Math.max(1, Math.min(20, Number(params.limit) || 5))
    const evidenceLimit = Math.max(1, Math.min(20, Number(params.evidenceLimit) || 4))
    console.info('[search] concepts:fallback:start', { query, limit, evidenceLimit })
    if (!query) {
      return { runtime: 'tauri-js-fallback', query, candidates: [], ambiguous: false, reason: 'empty-query' }
    }

    const results = await target.elephantnote.search.query({ query, mode: 'exact', limit: Math.max(limit * evidenceLimit, limit) })
    const items = Array.isArray(results) ? results : []
    const groups = new Map()
    for (const result of items) {
      const path = normalizeSearchPath(result.relativePath || result.path || '')
      if (!path) continue
      const parts = path.split('/').filter(Boolean)
      const id = parts.length > 1 ? parts[0] : titleFromPath(path)
      const current = groups.get(id) || {
        id,
        title: id,
        score: 0,
        evidenceChunks: []
      }
      current.score += Number(result.score || 1)
      if (current.evidenceChunks.length < evidenceLimit) {
        current.evidenceChunks.push({
          path,
          title: result.title || titleFromPath(path),
          excerpt: result.excerpt || result.preview || '',
          score: Number(result.score || 1)
        })
      }
      groups.set(id, current)
    }

    const candidates = [...groups.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
    const route = {
      runtime: 'tauri-js-fallback',
      query,
      candidates,
      ambiguous: candidates.length > 1,
      reason: 'rust-search-concepts-command-unavailable'
    }
    console.info('[search] concepts:fallback:done', {
      query,
      candidates: candidates.length,
      evidence: candidates.reduce((sum, candidate) => sum + candidate.evidenceChunks.length, 0)
    })
    return route
  }

  console.info('[search] concepts:fallback:installed')
  return true
}

const selectedChatModelFromConfig = (config = {}) => {
  const route = config.routes?.chat || {}
  return String(
    config.localModelSelection?.chat ||
    route.model ||
    route.modelId ||
    route.id ||
    ''
  ).trim()
}

const shouldAutostartLlama = (config = {}) => {
  const route = config.routes?.chat || {}
  const localAi = config.localAi || {}
  if (localAi.enabled === false) return false
  if (localAi.allowLocalRuntimeAutostart === false) return false
  if (!selectedChatModelFromConfig(config)) return false
  return ['app-local', 'local', 'node-llama-cpp', 'local-llama.cpp', ''].includes(String(route.provider || route.source || '').trim())
}

const autostartLlamaRuntime = async(target = globalThis) => {
  if (!target.__TAURI__ || !target.elephantnote?.ai?.getConfig || !target.elephantnote?.rag?.chat) return false
  try {
    const config = await target.elephantnote.ai.getConfig()
    const model = selectedChatModelFromConfig(config)
    const enabled = shouldAutostartLlama(config)
    console.info('[llama-autostart] config:loaded', {
      enabled,
      model: model || '<none>',
      localAi: config.localAi || {},
      chatRoute: config.routes?.chat || {}
    })
    if (!enabled) return false
    void target.elephantnote.rag.chat({
      message: 'warmup',
      messages: [{ role: 'user', content: 'warmup' }],
      maxTokens: 1,
      temperature: 0,
      aiConfig: config,
      modelSelection: config.localModelSelection || {}
    }).then((result) => {
      console.info('[llama-autostart] done', {
        model,
        runtime: result?.runtime || '',
        provider: result?.provider || '',
        warning: result?.warning || ''
      })
    }).catch((error) => {
      console.warn('[llama-autostart] failed', { model, error: error?.message || String(error) })
    })
    return true
  } catch (error) {
    console.warn('[llama-autostart] config failed', { error: error?.message || String(error) })
    return false
  }
}

installRendererDiagnostics()
globalThis.marktext = {}
clearBootstrapFileUtilsFallbackForTauri()
installTauriRuntimeBridge()
ensurePathResolve()
installTauriFileUtilsPathGuards()
installTauriElephantNoteBridge()
installTauriSearchRuntimeGuards()
installTauriSearchConceptFallback()
installPiProviderBridge()
installTauriMarkTextSaveBridge()
installTauriLocalIpcBridge()
installSlashMenuDiagnostics()
installWritingCommandBridge()
void autostartLlamaRuntime()

const bootstrapTauriRuntime = async() => {
  pushDiagnosticLog('info', 'bootstrapTauriRuntime:start', { runtime: window.__MARKTEXT_RUNTIME__ })
  try {
    const userDataPath = await appDataDir()
    window.__MARKTEXT_USER_DATA_PATH__ = userDataPath
    window.__MARKTEXT_WINDOW_ID__ = 1
    window.__MARKTEXT_WINDOW_TYPE__ = 'editor'
    pushDiagnosticLog('info', 'bootstrapTauriRuntime:appDataDir', { userDataPath })
  } catch (error) {
    pushDiagnosticLog('warn', 'bootstrapTauriRuntime:appDataDir fallback', error)
    window.__MARKTEXT_USER_DATA_PATH__ =
      window.__MARKTEXT_USER_DATA_PATH__ ||
      window.path.resolve('/tmp', 'elephantnote')
    window.__MARKTEXT_WINDOW_ID__ = 1
    window.__MARKTEXT_WINDOW_TYPE__ = 'editor'
  }

  bootstrapRenderer()
  pushDiagnosticLog('info', 'bootstrapRenderer:done', { env: globalThis.marktext?.env })
  restorePortableWindowState().catch((error) => {
    pushDiagnosticLog('warn', 'window-state restore failed', error)
  })
  window.addEventListener('beforeunload', () => {
    void savePortableWindowState().catch((error) => {
      pushDiagnosticLog('warn', 'window-state save failed', error)
    })
  })
}

const bootstrapForRuntime = async(runtime) => {
  if (runtime !== 'tauri') {
    const message = `ElephantNote renderer is Tauri-only; unsupported runtime "${runtime}"`
    pushDiagnosticLog('error', 'bootstrapTauriRuntime:unsupported-runtime', { runtime })
    throw new Error(message)
  }
  await bootstrapTauriRuntime()
  return globalThis.marktext?.env?.type || window.__MARKTEXT_WINDOW_TYPE__ || 'editor'
}

const mountRendererApp = (runtime, windowType) => {
  const router = createRouter({
    history: createWebHashHistory(),
    routes: resolveRendererRoutes(createRoutes, windowType)
  })

  const app = createApp(Main)
  installRendererDiagnostics(app)
  app.use(pinia)
  app.use(router)
  app.use(ElementPlus, { locale: en })
  app.use(i18nPlugin)
  app.config.globalProperties.$http = axios
  app.config.globalProperties.$services = services
  installAddonSystem(app, {
    router,
    pinia,
    services,
    runtime,
    logger: {
      info: (message, payload) => pushDiagnosticLog('info', message, payload),
      warn: (message, payload) => pushDiagnosticLog('warn', message, payload),
      error: (message, payload) => pushDiagnosticLog('error', message, payload)
    }
  })
  app.mount('#app')

  installGraphRuntimeFixes()
  installStoreDiagnostics()
  installExcalidrawMarkdownCleanup()
  installExcalidrawImageRuntimeFixes()
}

const startRendererApp = async() => {
  const runtime = 'tauri'
  window.__MARKTEXT_RUNTIME__ = runtime
  const windowType = await bootstrapForRuntime(runtime)
  mountRendererApp(runtime, windowType)
}

void startRendererApp().catch((error) => {
  pushDiagnosticLog('error', 'renderer startup failed', error)
  setTimeout(() => {
    throw error
  }, 0)
})

if (import.meta.hot) {
  import.meta.hot.accept()
}
