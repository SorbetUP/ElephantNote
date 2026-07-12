const BENIGN_LLAMA_WARNING_PATTERNS = Object.freeze([
  /llama_context:\s*n_ctx_seq\s*\([^)]*\)\s*<\s*n_ctx_train\s*\([^)]*\).*full capacity of the model will not be utilized/i,
  /embeddings required but some input tokens were not marked as outputs\s*->\s*overriding/i
])

const warningText = (value) => {
  if (value instanceof Error) return `${value.name}: ${value.message}`
  if (globalThis.Buffer?.isBuffer?.(value)) return value.toString('utf8')
  return String(value ?? '')
}

export const shouldSuppressLlamaWarningText = (value) => {
  const text = warningText(value)
  return BENIGN_LLAMA_WARNING_PATTERNS.some((pattern) => pattern.test(text))
}

export const installLlamaWarningFilter = ({
  process: processLike = globalThis.process,
  console: consoleLike = globalThis.console
} = {}) => {
  const restorers = []

  for (const methodName of ['log', 'info', 'warn', 'error']) {
    const original = consoleLike?.[methodName]
    if (typeof original !== 'function') continue
    consoleLike[methodName] = (...args) => {
      if (args.some(shouldSuppressLlamaWarningText)) return undefined
      return original.apply(consoleLike, args)
    }
    restorers.push(() => {
      consoleLike[methodName] = original
    })
  }

  if (typeof processLike?.emitWarning === 'function') {
    const originalEmitWarning = processLike.emitWarning
    processLike.emitWarning = (...args) => {
      if (args.some(shouldSuppressLlamaWarningText)) return undefined
      return originalEmitWarning.apply(processLike, args)
    }
    restorers.push(() => {
      processLike.emitWarning = originalEmitWarning
    })
  }

  for (const streamName of ['stdout', 'stderr']) {
    const stream = processLike?.[streamName]
    const originalWrite = stream?.write
    if (typeof originalWrite !== 'function') continue
    stream.write = function filteredWrite(chunk, encoding, callback) {
      if (shouldSuppressLlamaWarningText(chunk)) {
        if (typeof encoding === 'function') encoding()
        else if (typeof callback === 'function') callback()
        return true
      }
      return originalWrite.call(this, chunk, encoding, callback)
    }
    restorers.push(() => {
      stream.write = originalWrite
    })
  }

  return () => {
    while (restorers.length) restorers.pop()()
  }
}
