import Muya from 'muya/lib'

const INSTALL_GUARD_KEY = Symbol.for('elephantnote.muya-plugin-registration-guard')

const getPluginId = (plugin) => String(
  plugin?.pluginName ||
  plugin?.name ||
  plugin?.constructor?.pluginName ||
  plugin?.constructor?.name ||
  ''
).trim()

export const installMuyaPluginRegistrationGuard = () => {
  if (globalThis[INSTALL_GUARD_KEY]) return globalThis[INSTALL_GUARD_KEY]

  const originalUse = Muya.use.bind(Muya)
  const registered = new Set()

  Muya.use = (plugin, options) => {
    const id = getPluginId(plugin)
    if (id && registered.has(id)) return Muya

    const result = originalUse(plugin, options)
    if (id) registered.add(id)
    return result
  }

  const guard = Object.freeze({ registered })
  globalThis[INSTALL_GUARD_KEY] = guard
  return guard
}
