const getInvoke = (target = globalThis) => target?.__TAURI__?.core?.invoke

const MOBILE_VAULT_CHOICE_KEY = 'elephantnote:mobile-vault-choice-v3'

const invoke = (target, command, payload = {}) => {
  const invokeCommand = getInvoke(target)
  if (typeof invokeCommand !== 'function') {
    throw new Error(`Tauri command API is unavailable for ${command}`)
  }
  return invokeCommand(command, payload)
}

const normalizePath = (value = '') => String(value || '')
  .replace(/\\/g, '/')
  .replace(/\/+$/g, '')

const hasExplicitVaultChoice = (target) => {
  try {
    return target?.localStorage?.getItem(MOBILE_VAULT_CHOICE_KEY) === '1'
  } catch {
    return false
  }
}

const rememberExplicitVaultChoice = (target) => {
  try {
    target?.localStorage?.setItem(MOBILE_VAULT_CHOICE_KEY, '1')
  } catch {
    // A constrained WebView may disable localStorage. The selected vault still remains in Rust config.
  }
}

export const defaultMobileVaultPath = async () => {
  const { appDataDir } = await import('@tauri-apps/api/path')
  const base = await appDataDir()
  return `${String(base || '').replace(/[\\/]+$/g, '')}/vaults/Personal`
}

const hideLegacyAutomaticVaultUntilChoice = async (payload, target) => {
  if (!payload || hasExplicitVaultChoice(target)) return payload
  const privatePath = normalizePath(await defaultMobileVaultPath())
  const activePath = normalizePath(payload?.activeVault?.path)
  if (!activePath || activePath !== privatePath) return payload
  return {
    ...payload,
    activeVaultId: null,
    activeVault: null,
    workspace: null,
    entries: [],
    requiresVaultChoice: true
  }
}

export const patchMobileVaultBridge = (bridge, target = globalThis) => {
  if (!bridge || typeof bridge !== 'object' || bridge.__elephantnoteMobileVaultBridge) return bridge

  const originalGetVaults = typeof bridge.getVaults === 'function'
    ? bridge.getVaults.bind(bridge)
    : null
  const originalSelectVault = typeof bridge.selectVault === 'function'
    ? bridge.selectVault.bind(bridge)
    : null

  if (originalGetVaults) {
    bridge.getVaults = async () => hideLegacyAutomaticVaultUntilChoice(
      await originalGetVaults(),
      target
    )
  }

  bridge.createLocalVault = async () => {
    const result = await invoke(target, 'tauri_vaults_select_path', {
      vaultPath: await defaultMobileVaultPath()
    })
    rememberExplicitVaultChoice(target)
    return result
  }

  bridge.selectVault = async () => {
    if (!originalSelectVault) {
      throw new Error('The Android folder picker is unavailable in this build.')
    }

    const previousPrivatePath = normalizePath(await defaultMobileVaultPath())
    const result = await originalSelectVault()
    const selectedPath = normalizePath(result?.activeVault?.path)

    // The base bridge historically returned the current vault when the Android
    // picker was cancelled. Convert that ambiguous response into a real cancel.
    if (!selectedPath || (!hasExplicitVaultChoice(target) && selectedPath === previousPrivatePath)) {
      return { canceled: true }
    }

    if (selectedPath.startsWith('content://')) {
      throw new Error(
        'This Android provider exposed only a document URI. Select a filesystem-backed folder, or use Simple mode while full SAF document-tree support is being added.'
      )
    }

    rememberExplicitVaultChoice(target)
    return result
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
