const getInvoke = (target = globalThis) => target?.__TAURI__?.core?.invoke

const invoke = (target, command, payload = {}) => {
  const invokeCommand = getInvoke(target)
  if (typeof invokeCommand !== 'function') {
    throw new Error(`Tauri command API is unavailable for ${command}`)
  }
  return invokeCommand(command, payload)
}

export const defaultMobileVaultPath = async () => {
  const { appDataDir } = await import('@tauri-apps/api/path')
  const base = await appDataDir()
  return `${String(base || '').replace(/[\\/]+$/g, '')}/vaults/Personal`
}

export const patchMobileVaultBridge = (bridge, target = globalThis) => {
  if (!bridge || typeof bridge !== 'object' || bridge.__elephantnoteMobileVaultBridge) return bridge

  const originalSelectVault = typeof bridge.selectVault === 'function'
    ? bridge.selectVault.bind(bridge)
    : null

  bridge.createLocalVault = async () => invoke(target, 'tauri_vaults_select_path', {
    vaultPath: await defaultMobileVaultPath()
  })

  bridge.selectVault = async () => {
    if (originalSelectVault) {
      try {
        const result = await originalSelectVault()
        if (result && !result.canceled) return result
      } catch (error) {
        console.warn('[vault] native directory picker unavailable, using phone vault', error)
      }
    }
    return bridge.createLocalVault()
  }

  Object.defineProperty(bridge, '__elephantnoteMobileVaultBridge', {
    value: true,
    enumerable: false
  })
  return bridge
}

export const installMobileVaultBridge = (target = globalThis) => {
  let currentBridge = patchMobileVaultBridge(target.elephantnote, target)
  const descriptor = Object.getOwnPropertyDescriptor(target, 'elephantnote')

  if (descriptor?.configurable === false) return currentBridge

  Object.defineProperty(target, 'elephantnote', {
    configurable: true,
    enumerable: true,
    get: () => currentBridge,
    set: (bridge) => {
      currentBridge = patchMobileVaultBridge(bridge, target)
    }
  })

  return currentBridge
}

installMobileVaultBridge()
