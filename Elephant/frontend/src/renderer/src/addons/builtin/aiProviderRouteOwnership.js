import { elephantnoteClient } from 'elephant-front/services/elephantnoteClient'

const ROUTE_BY_CAPABILITY = Object.freeze({
  chat: 'chat',
  embedding: 'embedding',
  ocr: 'ocr'
})

const routeUsesProvider = (route = {}, providerId) => {
  return route.source === providerId || route.provider === providerId
}

const disabledRoute = (route = {}) => ({
  ...route,
  source: 'disabled',
  provider: 'disabled',
  transport: 'disabled',
  endpoint: '',
  model: ''
})

export const disableProviderRoutes = async (providerId, options = {}) => {
  if (typeof providerId !== 'string' || !providerId.trim()) return false
  const capabilities = Array.isArray(options.capabilities) ? options.capabilities : ['chat']
  const config = await elephantnoteClient.ai.getConfig()
  const routes = { ...(config?.routes || {}) }
  let changed = false

  for (const capability of capabilities) {
    const routeName = ROUTE_BY_CAPABILITY[capability]
    if (!routeName || !routeUsesProvider(routes[routeName], providerId)) continue
    routes[routeName] = disabledRoute(routes[routeName])
    changed = true
  }

  const chatWasOwned = routeUsesProvider(config?.routes?.chat, providerId)
    || config?.provider === providerId
  const localAi = { ...(config?.localAi || {}) }
  if (options.disableLocalAi === true && localAi.enabled === true) {
    localAi.enabled = false
    changed = true
  }

  if (!changed) return false

  await elephantnoteClient.ai.setConfig({
    ...config,
    ...(chatWasOwned
      ? { provider: 'disabled', transport: 'disabled', endpoint: '', model: '' }
      : {}),
    localAi,
    routes
  })
  return true
}
