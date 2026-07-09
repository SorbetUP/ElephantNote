const levelToConsole = (level) => {
  if (level === false || level === 'silent') return null
  return level || 'info'
}

const terminalSafeDetails = (args = []) => {
  if (args.length < 2) return {}
  const value = args[1]
  if (value == null) return {}
  if (value instanceof Error) {
    return { error: value.message, name: value.name }
  }
  if (typeof value === 'object') return value
  return { value: String(value) }
}

const forwardGraphLogToTauri = (level, args = []) => {
  const message = typeof args[0] === 'string' ? args[0] : ''
  if (!message.startsWith('[Graph]')) return
  const invoke = globalThis.__TAURI__?.core?.invoke
  if (typeof invoke !== 'function') return
  Promise.resolve(invoke('tauri_debug_log', {
    level,
    message,
    details: terminalSafeDetails(args)
  })).catch(() => null)
}

const makeLogger = () => {
  const state = {
    errorHandler: null,
    transports: {
      console: { level: 'info' },
      file: { level: 'info', sync: false, resolvePathFn: null }
    }
  }

  const emit = (method, args) => {
    const level = levelToConsole(state.transports.console.level)
    if (!level) return
    const fn = console[method] || console.log
    fn.apply(console, args)
    forwardGraphLogToTauri(method, args)
  }

  return {
    transports: state.transports,
    errorHandler: {
      startCatching: ({ onError } = {}) => {
        state.errorHandler = onError || null
      }
    },
    initialize: () => {},
    info: (...args) => emit('info', args),
    warn: (...args) => emit('warn', args),
    error: (...args) => {
      emit('error', args)
      state.errorHandler?.(args[0] instanceof Error ? args[0] : new Error(String(args[0] || 'Error')))
    },
    debug: (...args) => emit('debug', args),
    log: (...args) => emit('log', args)
  }
}

export default makeLogger()
