const DETACHED_TTL_MS = 1000

export const installExecutableCodeNativeLifecycle = (runtime) => {
  if (!runtime || runtime.__nativeLifecycleInstalled) return runtime
  runtime.__nativeLifecycleInstalled = true

  const originalRegister = runtime.registerOutput.bind(runtime)
  runtime.registerOutput = (element) => {
    originalRegister(element)
    const state = [...runtime.states.values()].find((candidate) => candidate.output === element)
    if (state) element.__elephantCodeStateKey = state.key
  }

  const originalUnregister = runtime.unregisterOutput.bind(runtime)
  runtime.unregisterOutput = (element) => {
    const key = element.__elephantCodeStateKey
    if (!key) return originalUnregister(element)
    const state = runtime.states.get(key)
    if (!state || state.output !== element) return

    state.output = null
    if (state.detachTimer) clearTimeout(state.detachTimer)
    state.detachTimer = setTimeout(() => {
      if (state.output?.isConnected) return
      if (state.executionId) void runtime.stop(state)
      runtime.states.delete(key)
    }, DETACHED_TTL_MS)
  }

  for (const state of runtime.states.values()) {
    if (state.output) state.output.__elephantCodeStateKey = state.key
  }

  const originalDispose = runtime.dispose.bind(runtime)
  runtime.dispose = () => {
    for (const state of runtime.states.values()) {
      if (state.detachTimer) clearTimeout(state.detachTimer)
    }
    originalDispose()
  }

  return runtime
}
