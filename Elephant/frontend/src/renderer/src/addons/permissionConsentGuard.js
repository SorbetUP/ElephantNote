const permissionLines = (manifest = {}) => {
  const permissions = manifest.permissions
  if (Array.isArray(permissions)) return permissions.map((permission) => `• ${permission}`)
  if (!permissions || typeof permissions !== 'object') return []
  const lines = []
  for (const scope of permissions.notes?.read || []) lines.push(`• Read notes: ${scope}`)
  for (const scope of permissions.notes?.write || []) lines.push(`• Write notes: ${scope}`)
  for (const host of permissions.network?.hosts || []) lines.push(`• Network: ${host}`)
  if (permissions.storage) lines.push('• Private addon storage')
  if (permissions.commands) lines.push('• Register and run commands')
  if (permissions.native) lines.push('• Native system access')
  return lines
}

export const installAddonPermissionConsentGuard = (manager, target = globalThis) => {
  const external = manager?.external
  if (!external || external.__elephantConsentGuardInstalled) return () => {}

  const originalApproveTrusted = external.approveTrusted.bind(external)
  external.approveTrusted = async (addonId) => {
    const current = await external.getTrustState(addonId)
    if (current?.approved) return current

    const snapshot = manager.get(addonId)
    const manifest = snapshot?.manifest || external.getRecord(addonId)?.manifest || {}
    const rights = permissionLines(manifest)
    const details = rights.length ? `\n\nRequested rights:\n${rights.join('\n')}` : ''
    const approved = target.confirm?.(
      `${manifest.name || addonId} requests Full app access.\n\n` +
      'It will run inside ElephantNote and can modify the interface, editor and application behavior.' +
      details +
      '\n\nOnly continue if you trust this addon.'
    )
    if (approved !== true) {
      const error = new Error(`Full app access was not approved for ${manifest.name || addonId}`)
      error.code = 'TRUST_DENIED'
      throw error
    }
    return originalApproveTrusted(addonId)
  }

  external.__elephantConsentGuardInstalled = true
  manager.logger?.info?.('[addons] permission-consent:installed')

  return () => {
    external.approveTrusted = originalApproveTrusted
    delete external.__elephantConsentGuardInstalled
  }
}
