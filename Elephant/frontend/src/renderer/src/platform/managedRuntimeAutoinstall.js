const wrapProvider = (provider) => {
  if (!provider?.ensure || !provider?.status || provider.__elephantManagedAutoinstall) return false
  const originalStatus = provider.status.bind(provider)
  provider.status = async(payload = {}) => {
    await provider.ensure(payload)
    return originalStatus(payload)
  }
  provider.__elephantManagedAutoinstall = true
  return true
}

export const installManagedRuntimeAutoinstall = (target = globalThis) => {
  const ai = target?.elephantnote?.ai
  if (!ai) return false
  const codex = wrapProvider(ai.codex)
  const opencode = wrapProvider(ai.opencode)
  return codex || opencode
}
