const BENIGN_LLAMA_WARNING_SNIPPETS = [
  'llama_context: n_ctx_seq (',
  'init: embeddings required but some input tokens were not marked as outputs -> overriding'
]

export const normalizeLlamaWarningText = (value = '') => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeLlamaWarningText(item)).filter(Boolean).join(' ')
  }
  return String(value || '').replace(/\s+/g, ' ').trim()
}

export const shouldSuppressLlamaWarningText = (...args) => {
  const text = normalizeLlamaWarningText(args)
  return BENIGN_LLAMA_WARNING_SNIPPETS.some((snippet) => text.includes(snippet))
}

export const installLlamaWarningFilter = ({ process: processRef = process, console: consoleRef = console } = {}) => {
  const wrapConsoleMethod = (methodName) => {
    const original = consoleRef?.[methodName]
    if (typeof original !== 'function' || original.__elephantLlamaFilterInstalled) return
    const wrapped = (...args) => {
      if (shouldSuppressLlamaWarningText(...args)) return
      return original.apply(consoleRef, args)
    }
    wrapped.__elephantLlamaFilterInstalled = true
    consoleRef[methodName] = wrapped
  }

  for (const methodName of ['log', 'info', 'warn', 'error']) {
    wrapConsoleMethod(methodName)
  }

  const originalEmitWarning = processRef?.emitWarning
  if (typeof originalEmitWarning === 'function' && !originalEmitWarning.__elephantLlamaFilterInstalled) {
    const wrappedEmitWarning = (warning, ...rest) => {
      const warningText = normalizeLlamaWarningText(
        typeof warning === 'string'
          ? warning
          : warning?.message || warning?.name || warning?.toString?.() || ''
      )
      if (shouldSuppressLlamaWarningText(warningText)) return
      return originalEmitWarning.call(processRef, warning, ...rest)
    }
    wrappedEmitWarning.__elephantLlamaFilterInstalled = true
    processRef.emitWarning = wrappedEmitWarning
  }

  const streams = [processRef?.stdout, processRef?.stderr]

  for (const stream of streams) {
    if (!stream?.write || stream.__elephantLlamaFilterInstalled) continue
    const originalWrite = stream.write.bind(stream)
    let pending = ''

    const flushLine = (line) => {
      const trimmed = String(line || '').replace(/\s+/g, ' ').trim()
      if (!trimmed) return ''
      if (shouldSuppressLlamaWarningText(trimmed)) return ''
      return `${line}\n`
    }

    stream.write = (chunk, encoding, callback) => {
      const text = typeof chunk === 'string'
        ? chunk
        : Buffer.from(chunk).toString(typeof encoding === 'string' ? encoding : 'utf8')
      pending += text
      const lines = pending.split(/\r?\n/)
      pending = lines.pop() || ''
      const output = lines.map(flushLine).join('')
      if (output) {
        return originalWrite(output, encoding, callback)
      }
      if (typeof callback === 'function') callback()
      return true
    }

    stream.__elephantLlamaFilterInstalled = true
  }
}
