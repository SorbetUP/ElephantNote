const MAX_LOGS = 500

const toErrorObject = (error) => ({
  name: error?.name || 'Error',
  message: error?.message || String(error || ''),
  stack: error?.stack || ''
})

const forwardToTauriTerminal = (entry) => {
  const invoke = globalThis.window?.__TAURI__?.core?.invoke
  if (!invoke) return
  try {
    void invoke('tauri_debug_log', {
      level: entry.level,
      message: entry.message,
      details: entry.details || null
    }).catch(() => {})
  } catch {}
}

export const pushDiagnosticLog = (level, message, details = null) => {
  const target = globalThis.window || globalThis
  const entry = {
    time: new Date().toISOString(),
    level,
    message,
    details: details instanceof Error ? toErrorObject(details) : details
  }
  target.__ELEPHANT_DEBUG_LOGS__ = target.__ELEPHANT_DEBUG_LOGS__ || []
  target.__ELEPHANT_DEBUG_LOGS__.push(entry)
  if (target.__ELEPHANT_DEBUG_LOGS__.length > MAX_LOGS) target.__ELEPHANT_DEBUG_LOGS__.shift()
  const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'
  console[method](`[elephant:${level}] ${message}`, entry.details || '')
  forwardToTauriTerminal(entry)
  return entry
}

export const showDiagnosticOverlay = (title, error) => {
  const doc = globalThis.document
  if (!doc?.body) return
  let node = doc.getElementById('elephant-diagnostic-overlay')
  if (!node) {
    node = doc.createElement('pre')
    node.id = 'elephant-diagnostic-overlay'
    node.style.position = 'fixed'
    node.style.inset = '16px'
    node.style.zIndex = '2147483647'
    node.style.background = '#111'
    node.style.color = '#fff'
    node.style.border = '1px solid #ff5c5c'
    node.style.borderRadius = '12px'
    node.style.padding = '16px'
    node.style.overflow = 'auto'
    doc.body.appendChild(node)
  }
  const data = toErrorObject(error)
  node.textContent = `${title}\n\n${data.message}\n\n${data.stack}\n\nRead window.__ELEPHANT_DEBUG_LOGS__ for recent logs.`
}

export const installRendererDiagnostics = (app = null) => {
  pushDiagnosticLog('info', 'renderer diagnostics installed')

  globalThis.window?.addEventListener?.('error', (event) => {
    pushDiagnosticLog('error', 'window error', event.error || event.message)
    showDiagnosticOverlay('Renderer window error', event.error || event.message)
  })

  globalThis.window?.addEventListener?.('unhandledrejection', (event) => {
    pushDiagnosticLog('error', 'unhandled promise rejection', event.reason)
    showDiagnosticOverlay('Unhandled promise rejection', event.reason)
  })

  if (app?.config) {
    app.config.errorHandler = (error, instance, info) => {
      pushDiagnosticLog('error', `vue error: ${info}`, error)
      showDiagnosticOverlay(`Vue error: ${info}`, error)
      throw error
    }
    app.config.warnHandler = (message, instance, trace) => {
      pushDiagnosticLog('warn', `vue warning: ${message}`, { trace })
    }
  }
}

export const getDiagnosticLogs = () => (globalThis.window || globalThis).__ELEPHANT_DEBUG_LOGS__ || []
