export const ELEPHANTNOTE_FEATURE_FLAGS = Object.freeze({
  askAi: true,
  sitePreview: true,
  gitSync: false,
  agents: true,
  semanticSearch: true
})

export const normalizeFeatureFlags = (flags = {}) => {
  const normalized = { ...ELEPHANTNOTE_FEATURE_FLAGS }
  for (const key of Object.keys(normalized)) {
    if (typeof flags[key] === 'boolean') {
      normalized[key] = flags[key]
    }
  }
  return normalized
}

export const setFeatureFlag = (flags, key, enabled) => {
  const normalized = normalizeFeatureFlags(flags)
  if (!Object.prototype.hasOwnProperty.call(normalized, key)) {
    const error = new Error(`Unknown ElephantNote feature flag: ${key}.`)
    error.code = 'ELEPHANTNOTE_UNKNOWN_FEATURE_FLAG'
    throw error
  }
  normalized[key] = enabled !== false
  return normalized
}
