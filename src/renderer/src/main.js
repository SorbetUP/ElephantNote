import './platform/bootstrapGlobals'
import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import bootstrapRenderer from './bootstrap'
import axios from './axios'
import pinia from './store'
import './assets/symbolIcon'
import { installRuntimeBridge } from './platform/runtimeBridge'
import { installTauriElephantNoteBridge } from './platform/tauriElephantNoteBridge'
import { restorePortableWindowState, savePortableWindowState } from './platform/windowState'
import { installRendererDiagnostics, pushDiagnosticLog, showDiagnosticOverlay } from './platform/rendererDiagnostics'
import { installStoreDiagnostics } from './platform/storeDiagnostics'
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

import './assets/styles/index.css'
import './assets/styles/printService.css'

// -----------------------------------------------

installRendererDiagnostics()
globalThis.marktext = {}
installRuntimeBridge()
installTauriElephantNoteBridge()
const isNonElectronRuntime = () => window.__MARKTEXT_RUNTIME__ && window.__MARKTEXT_RUNTIME__ !== 'electron'

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

const startApp = async() => {
  try {
    pushDiagnosticLog('info', 'startApp:start')
    await bootstrapTauriRuntime()

    // Create Vue app
    const app = createApp(Main)
    installRendererDiagnostics(app)

    // Configure Element Plus with locale
    app.use(ElementPlus, {
      locale: en
    })

    const router = createRouter({
      history: createWebHashHistory(),
      // it seems like something might have changed in vue-router? it uses the full "file path" instead of
      // links like /editor if we use the old createWebHistory()
      routes: routes(globalThis.marktext.env.type)
    })

    router.beforeEach((to, from) => {
      pushDiagnosticLog('info', 'router:navigate', { from: from.fullPath, to: to.fullPath })
    })
    router.onError((error) => {
      pushDiagnosticLog('error', 'router:error', error)
      showDiagnosticOverlay('Router error', error)
    })

    app.use(router)
    app.use(pinia)
    installStoreDiagnostics()
    app.use(i18nPlugin)

    // Configure axios globally
    app.config.globalProperties.$http = axios

    // Register services globally
    services.forEach((s) => {
      app.config.globalProperties['$' + s.name] = s[s.name]
    })

    // Mount the app
    app.mount('#app')
    pushDiagnosticLog('info', 'vue:mounted')

    if (isNonElectronRuntime()) {
      setTimeout(() => {
        pushDiagnosticLog('info', 'bootstrap-editor:send-default')
        window.electron?.ipcRenderer?.send('mt::bootstrap-editor', {
          addBlankTab: true,
          markdownList: [],
          lineEnding: 'lf',
          sideBarVisibility: false,
          tabBarVisibility: true,
          sourceCodeModeEnabled: false
        })
      }, 0)
    }
  } catch (error) {
    pushDiagnosticLog('error', 'startApp:fatal', error)
    showDiagnosticOverlay('Fatal renderer bootstrap error', error)
    throw error
  }
}

void startApp()
