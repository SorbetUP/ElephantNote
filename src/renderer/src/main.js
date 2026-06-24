import './platform/bootstrapGlobals'
import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import bootstrapRenderer from './bootstrap'
import axios from './axios'
import pinia from './store'
import './assets/symbolIcon'
import { installRuntimeBridge } from './platform/runtimeBridge'
import { installTauriElephantNoteBridge } from './platform/tauriElephantNoteBridge'
import { installCodexProviderBridge } from './platform/providerInterface'
import { installTauriMarkTextSaveBridge } from './platform/tauriMarkTextSaveBridge'
import { installTauriLocalIpcBridge } from './platform/tauriLocalIpcBridge'
import { restorePortableWindowState, savePortableWindowState } from './platform/windowState'
import { installRendererDiagnostics, pushDiagnosticLog } from './platform/rendererDiagnostics'
import { installStoreDiagnostics } from './platform/storeDiagnostics'
import { installAddonSystem } from './addons'
import { appDataDir } from '@tauri-apps/api/path'

// Element Plus instead of Element UI for Vue 3
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import en from 'element-plus/es/locale/lang/en'

// I18n translation system
import i18nPlugin from './i18n'

// something is wrong here! \/
import services from './services/index'
import routes from './router'
import Main from './Main.vue'
import { installGraphRuntimeFixes } from 'elephant-front/runtime/graphRuntimeFixes'

import './assets/styles/index.css'
import './assets/styles/printService.css'
import 'elephant-front/styles/runtime-layout-fixes.css'

// -----------------------------------------------

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

installRendererDiagnostics()
globalThis.marktext = {}
clearBootstrapFileUtilsFallbackForTauri()
installRuntimeBridge()
ensurePathResolve()
installTauriElephantNoteBridge()
installCodexProviderBridge()
installTauriMarkTextSaveBridge()
installTauriLocalIpcBridge()

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

// -----------------------------------------------
// Be careful when changing code before this line!

const runtime = window.__MARKTEXT_RUNTIME__ || (window.__TAURI__ ? 'tauri' : 'electron')
window.__MARKTEXT_RUNTIME__ = runtime

if (runtime === 'tauri') {
  bootstrapTauriRuntime()
} else {
  bootstrapRenderer()
}

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

const app = createApp(Main)
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

if (import.meta.hot) {
  import.meta.hot.accept()
}
