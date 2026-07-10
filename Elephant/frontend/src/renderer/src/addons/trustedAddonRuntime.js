import { ADDON_ACCESS_LEVEL, getAddonAccessLevel } from './manifest'

const COMMUNITY_ADDONS_PREF_KEY = 'addons.communityEnabled'
const TRUSTED_SAFE_MODE_PREF_KEY = 'addons.trustedSafeMode'
const TRUSTED_SAFE_MODE_LOCAL_KEY = 'elephantnote:addons:trusted-safe-mode'
const TRUST_APPROVAL_PREFIX = 'addons.trustedApproval.'

const getTauriCore = (target = globalThis) => target?.__TAURI__?.core || null

const invoke = (command, payload = {}, target = globalThis) => {
  const core = getTauriCore(target)
  if (!core?.invoke) throw new Error(`Tauri command API is unavailable for ${command}`)
  return core.invoke(command, payload)
}

const getPreference = (key, target = globalThis) => invoke('tauri_prefs_get', { key }, target)
const setPreference = (key, value, target = globalThis) => invoke('tauri_prefs_set', { key, value }, target)

const safeString = (value, fallback = '') => (typeof value === 'string' ? value.trim() || fallback : fallback)

const approvalKey = (addonId) => `${TRUST_APPROVAL_PREFIX}${addonId}`

export const isTrustedExternalManifest = (manifest = {}) => {
  return manifest?.source === 'external' && getAddonAccessLevel(manifest) === ADDON_ACCESS_LEVEL.trusted
}

export const getTrustedSafeMode = async (target = globalThis) => {
  const localValue = target?.localStorage?.getItem?.(TRUSTED_SAFE_MODE_LOCAL_KEY)
  if (localValue === 'true') return true
  try {
    return await getPreference(TRUSTED_SAFE_MODE_PREF_KEY, target) === true
  } catch {
    return false
  }
}

export const setTrustedSafeMode = async (enabled, target = globalThis) => {
  const value = enabled === true
  target?.localStorage?.setItem?.(TRUSTED_SAFE_MODE_LOCAL_KEY, String(value))
  await setPreference(TRUSTED_SAFE_MODE_PREF_KEY, value, target)
  return value
}

export const getTrustedApproval = async (record, target = globalThis) => {
  const id = safeString(record?.manifest?.id)
  const packageHash = safeString(record?.packageHash || record?.manifest?.packageHash)
  if (!id || !packageHash) return { approved: false, approvedHash: '', packageHash }
  const approvedHash = safeString(await getPreference(approvalKey(id), target))
  return {
    approved: approvedHash === packageHash,
    approvedHash,
    packageHash
  }
}

export const approveTrustedAddon = async (record, target = globalThis) => {
  const id = safeString(record?.manifest?.id)
  const packageHash = safeString(record?.packageHash || record?.manifest?.packageHash)
  if (!id || !packageHash) throw new Error('Trusted addon approval requires an installed package hash')
  await setPreference(approvalKey(id), packageHash, target)
  return { approved: true, approvedHash: packageHash, packageHash }
}

export const revokeTrustedAddon = async (record, target = globalThis) => {
  const id = safeString(record?.manifest?.id)
  if (!id) throw new Error('Trusted addon id is required')
  await setPreference(approvalKey(id), '', target)
  return { approved: false, approvedHash: '', packageHash: safeString(record?.packageHash) }
}

const requireFunction = (value, label) => {
  if (typeof value !== 'function') throw new TypeError(`${label} must be a function`)
  return value
}

const addDisposable = (context, disposables, dispose) => {
  requireFunction(dispose, 'dispose')
  let active = true
  const once = () => {
    if (!active) return
    active = false
    dispose()
  }
  disposables.push(once)
  context.addDisposable?.(once)
  return once
}

export const createTrustedAddonApi = (record, context, sessionDisposables = [], target = globalThis) => {
  const manifest = record.manifest
  const documentRef = target?.document
  const register = (area, contribution) => context.registerContribution(area, contribution)

  const api = {
    manifest,
    access: Object.freeze({
      level: ADDON_ACCESS_LEVEL.trusted,
      packageHash: safeString(record.packageHash),
      nativeRequested: manifest.permissions?.native === true
    }),
    app: Object.freeze({
      router: context.router,
      pinia: context.pinia,
      services: context.services,
      runtime: context.runtime,
      addons: context.addons,
      vueApp: context.vueApp,
      openSettings(section = 'addons') {
        target?.dispatchEvent?.(new CustomEvent('elephantnote:open-settings', { detail: { section } }))
      },
      emit(name, detail) {
        target?.dispatchEvent?.(new CustomEvent(name, { detail }))
      }
    }),
    workspace: Object.freeze({
      registerView: context.addView,
      registerSidebarItem: context.addSidebarItem,
      registerStatusBarItem: context.addStatusBarItem,
      registerContribution: register,
      openView(viewId, params = {}) {
        target?.dispatchEvent?.(new CustomEvent('elephantnote:addon-open-view', {
          detail: { viewId, params, addonId: manifest.id }
        }))
      }
    }),
    editor: Object.freeze({
      registerExtension: context.addEditorExtension,
      registerBlockType(definition) {
        return register('editor.block-types', definition)
      },
      registerInlineType(definition) {
        return register('editor.inline-types', definition)
      },
      registerInputRule(definition) {
        return register('editor.input-rules', definition)
      },
      registerToolbarItem(definition) {
        return register('editor.toolbar-items', definition)
      },
      registerPasteHandler(definition) {
        return register('editor.paste-handlers', definition)
      }
    }),
    markdown: Object.freeze({
      registerPostProcessor(definition) {
        return register('markdown.post-processors', definition)
      },
      registerCodeBlockProcessor(definition) {
        return register('markdown.code-block-processors', definition)
      },
      registerEmbedRenderer(definition) {
        return register('markdown.embed-renderers', definition)
      }
    }),
    settings: Object.freeze({
      registerSection: context.addSettingsSection,
      registerPage(definition) {
        return register('settings.pages', definition)
      }
    }),
    layout: Object.freeze({
      registerItem(definition) {
        return register('layout.items', definition)
      },
      registerZone(definition) {
        return register('layout.zones', definition)
      }
    }),
    commands: Object.freeze({
      register: context.addAction
    }),
    ui: Object.freeze({
      registerStyle(cssText, id = '') {
        if (!documentRef?.head) throw new Error('Document is unavailable')
        const style = documentRef.createElement('style')
        style.dataset.elephantAddon = manifest.id
        if (id) style.dataset.elephantAddonStyle = safeString(id)
        style.textContent = String(cssText || '')
        documentRef.head.appendChild(style)
        return addDisposable(context, sessionDisposables, () => style.remove())
      },
      on(eventTarget, eventName, listener, options) {
        if (!eventTarget?.addEventListener || !eventTarget?.removeEventListener) {
          throw new TypeError('Event target must implement addEventListener/removeEventListener')
        }
        requireFunction(listener, 'listener')
        eventTarget.addEventListener(eventName, listener, options)
        return addDisposable(context, sessionDisposables, () => eventTarget.removeEventListener(eventName, listener, options))
      },
      observe(element, listener, options = { childList: true, subtree: true }) {
        if (!target?.MutationObserver) throw new Error('MutationObserver is unavailable')
        requireFunction(listener, 'listener')
        const observer = new target.MutationObserver(listener)
        observer.observe(element, options)
        return addDisposable(context, sessionDisposables, () => observer.disconnect())
      }
    }),
    lifecycle: Object.freeze({
      addDisposable(dispose) {
        return addDisposable(context, sessionDisposables, dispose)
      }
    }),
    experimental: Object.freeze({
      window: target,
      document: documentRef,
      tauri: target?.__TAURI__,
      router: context.router,
      pinia: context.pinia,
      services: context.services,
      vueApp: context.vueApp,
      rawContext: context
    })
  }

  return Object.freeze(api)
}

const resolvePluginInstance = (module, api) => {
  const exported = module?.default ?? module?.plugin ?? module
  if (typeof exported === 'function') {
    try {
      return new exported(api)
    } catch (error) {
      if (/not a constructor/i.test(error?.message || '')) return exported(api)
      throw error
    }
  }
  return exported
}

export class TrustedAddonSession {
  constructor(record, logger, target = globalThis) {
    this.record = record
    this.logger = logger
    this.target = target
    this.module = null
    this.plugin = null
    this.api = null
    this.moduleUrl = ''
    this.disposables = []
    this.activationDispose = null
  }

  async start(context) {
    const entry = await invoke('tauri_addons_read_entry', { addonId: this.record.manifest.id }, this.target)
    const source = safeString(entry?.source)
    if (!source) throw new Error(`Trusted addon ${this.record.manifest.id} has an empty entry file`)

    const blob = new Blob([
      source,
      `\n//# sourceURL=elephant-addon://${this.record.manifest.id}/${this.record.manifest.runtime?.entry || 'main.js'}`
    ], { type: 'text/javascript' })
    this.moduleUrl = URL.createObjectURL(blob)
    this.module = await import(/* @vite-ignore */ this.moduleUrl)
    this.api = createTrustedAddonApi(this.record, context, this.disposables, this.target)
    this.plugin = resolvePluginInstance(this.module, this.api)

    const activate = this.plugin?.onload || this.plugin?.activate || this.module?.activate
    if (typeof activate !== 'function') {
      throw new Error('Trusted addon entry must export default { onload(api) {} } or an activate(api) function')
    }
    const dispose = await activate.call(this.plugin, this.api)
    if (typeof dispose === 'function') this.activationDispose = dispose
  }

  async stop() {
    const deactivate = this.plugin?.onunload || this.plugin?.deactivate || this.module?.deactivate
    try {
      if (typeof deactivate === 'function') await deactivate.call(this.plugin, this.api)
      if (typeof this.activationDispose === 'function') await this.activationDispose()
    } finally {
      while (this.disposables.length) {
        const dispose = this.disposables.pop()
        try {
          dispose()
        } catch (error) {
          this.logger?.warn?.('trusted addon cleanup failed', {
            id: this.record.manifest.id,
            error: error?.message || String(error)
          })
        }
      }
      if (this.moduleUrl) URL.revokeObjectURL(this.moduleUrl)
      this.moduleUrl = ''
      this.module = null
      this.plugin = null
      this.api = null
      this.activationDispose = null
    }
  }
}

export const createTrustedAddonDefinition = (record, logger) => {
  let session = null
  return {
    manifest: {
      ...record.manifest,
      source: 'external',
      packageHash: record.packageHash,
      installedAt: record.installedAt,
      defaultEnabled: false
    },
    async activate(context) {
      const communityEnabled = await getPreference(COMMUNITY_ADDONS_PREF_KEY)
      if (communityEnabled !== true) {
        throw new Error('Community addons are disabled. Turn them on in Settings → Addons first.')
      }
      if (await getTrustedSafeMode()) {
        throw new Error('Trusted addon safe mode is enabled. Disable safe mode before starting full app access addons.')
      }
      const approval = await getTrustedApproval(record)
      if (!approval.approved) {
        const error = new Error('Full app access approval is required for this exact addon package.')
        error.code = 'TRUST_REQUIRED'
        error.addonId = record.manifest.id
        error.packageHash = record.packageHash
        throw error
      }

      session = new TrustedAddonSession(record, logger)
      try {
        await session.start(context)
        await invoke('tauri_addons_set_enabled', { addonId: record.manifest.id, enabled: true })
      } catch (error) {
        await session.stop().catch(() => {})
        session = null
        await invoke('tauri_addons_set_enabled', { addonId: record.manifest.id, enabled: false }).catch(() => {})
        throw error
      }
      return () => session?.stop()
    },
    async deactivate() {
      await session?.stop()
      session = null
      await invoke('tauri_addons_set_enabled', { addonId: record.manifest.id, enabled: false })
    }
  }
}
