import { ADDON_EXTENSION_POINTS } from './extensionPoints'
import { ADDON_STATUS, assertAddonDefinition } from './manifest'

const createDefaultLogger = () => ({
  info: (...args) => console.info('[addons]', ...args),
  warn: (...args) => console.warn('[addons]', ...args),
  error: (...args) => console.error('[addons]', ...args)
})

const normalizeError = (error) => {
  if (!error) return null
  return {
    name: error.name || 'Error',
    message: error.message || String(error),
    stack: error.stack || ''
  }
}

const createSnapshot = (record) => ({
  manifest: record.manifest,
  enabled: record.enabled,
  status: record.status,
  error: record.error
})

const requireString = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string`)
  }
  return value.trim()
}

export class ElephantAddonManager {
  constructor(context = {}) {
    this.context = Object.freeze({ ...context, addons: this })
    this.logger = context.logger || createDefaultLogger()
    this.records = new Map()
    this.contributions = new Map()
    this.listeners = new Map()
  }

  register(addonDefinition) {
    const manifest = assertAddonDefinition(addonDefinition)
    if (this.records.has(manifest.id)) {
      throw new Error(`Addon already registered: ${manifest.id}`)
    }

    const record = {
      manifest,
      module: addonDefinition,
      enabled: false,
      status: ADDON_STATUS.disabled,
      error: null,
      disposables: []
    }

    this.records.set(manifest.id, record)
    this.emit('registered', createSnapshot(record))
    this.emit('changed', createSnapshot(record))
    return createSnapshot(record)
  }

  get(id) {
    const record = this.records.get(id)
    return record ? createSnapshot(record) : null
  }

  list() {
    return [...this.records.values()].map(createSnapshot)
  }

  async enable(id) {
    const record = this.requireRecord(id)
    if (record.enabled) return createSnapshot(record)

    record.status = ADDON_STATUS.activating
    record.error = null
    this.emit('changed', createSnapshot(record))

    try {
      const addonContext = this.createAddonContext(record)
      const dispose = await record.module.activate?.(addonContext)
      if (typeof dispose === 'function') record.disposables.push(dispose)
      record.enabled = true
      record.status = ADDON_STATUS.enabled
      this.emit('enabled', createSnapshot(record))
      this.emit('changed', createSnapshot(record))
      return createSnapshot(record)
    } catch (error) {
      this.disposeRecord(record)
      this.clearContributionsFromAddon(id)
      record.enabled = false
      record.status = ADDON_STATUS.error
      record.error = normalizeError(error)
      this.logger.error('addon activation failed', { id, error: record.error })
      this.emit('error', createSnapshot(record))
      this.emit('changed', createSnapshot(record))
      throw error
    }
  }

  async disable(id) {
    const record = this.requireRecord(id)
    if (!record.enabled && record.status !== ADDON_STATUS.error) return createSnapshot(record)

    try {
      await record.module.deactivate?.(this.createAddonContext(record))
    } finally {
      this.disposeRecord(record)
      this.clearContributionsFromAddon(id)
      record.enabled = false
      record.status = ADDON_STATUS.disabled
      record.error = null
      this.emit('disabled', createSnapshot(record))
      this.emit('changed', createSnapshot(record))
    }

    return createSnapshot(record)
  }

  async enableDefaultAddons() {
    const defaults = [...this.records.values()].filter((record) => record.manifest.defaultEnabled)
    for (const record of defaults) {
      await this.enable(record.manifest.id)
    }
  }

  registerContribution(addonId, area, contribution) {
    const normalizedAddonId = requireString(addonId, 'addonId')
    const normalizedArea = requireString(area, 'area')
    const record = this.requireRecord(normalizedAddonId)

    if (!this.contributions.has(normalizedArea)) {
      this.contributions.set(normalizedArea, [])
    }

    const entry = Object.freeze({
      addonId: record.manifest.id,
      contribution
    })

    this.contributions.get(normalizedArea).push(entry)
    this.emit('contribution:registered', { area: normalizedArea, entry })
    this.emit('contribution:changed', this.getContributionMap())

    return () => {
      this.unregisterContribution(normalizedArea, entry)
    }
  }

  unregisterContribution(area, entry) {
    const entries = this.contributions.get(area)
    if (!entries) return
    const nextEntries = entries.filter((candidate) => candidate !== entry)
    if (nextEntries.length) {
      this.contributions.set(area, nextEntries)
    } else {
      this.contributions.delete(area)
    }
    this.emit('contribution:removed', { area, entry })
    this.emit('contribution:changed', this.getContributionMap())
  }

  getContributions(area) {
    return [...(this.contributions.get(area) || [])]
  }

  getContributionMap() {
    return Object.fromEntries(
      [...this.contributions.entries()].map(([area, entries]) => [area, [...entries]])
    )
  }

  on(eventName, listener) {
    const normalizedEventName = requireString(eventName, 'eventName')
    if (typeof listener !== 'function') {
      throw new TypeError('listener must be a function')
    }

    if (!this.listeners.has(normalizedEventName)) {
      this.listeners.set(normalizedEventName, new Set())
    }

    this.listeners.get(normalizedEventName).add(listener)
    return () => this.listeners.get(normalizedEventName)?.delete(listener)
  }

  createAddonContext(record) {
    const register = (area, contribution) => {
      const dispose = this.registerContribution(record.manifest.id, area, contribution)
      record.disposables.push(dispose)
      return dispose
    }

    return Object.freeze({
      ...this.context,
      manifest: record.manifest,
      registerContribution: register,
      addAction: (action) => register(ADDON_EXTENSION_POINTS.actions, action),
      addSidebarItem: (item) => register(ADDON_EXTENSION_POINTS.sidebarItems, item),
      addSettingsSection: (section) => register(ADDON_EXTENSION_POINTS.settingsSections, section),
      addView: (view) => register(ADDON_EXTENSION_POINTS.views, view),
      addEditorExtension: (extension) => register(ADDON_EXTENSION_POINTS.editorExtensions, extension),
      addStatusBarItem: (item) => register(ADDON_EXTENSION_POINTS.statusBarItems, item),
      addDisposable: (dispose) => {
        if (typeof dispose !== 'function') throw new TypeError('dispose must be a function')
        record.disposables.push(dispose)
        return dispose
      }
    })
  }

  clearContributionsFromAddon(addonId) {
    let changed = false
    for (const [area, entries] of this.contributions.entries()) {
      const nextEntries = entries.filter((entry) => entry.addonId !== addonId)
      if (nextEntries.length !== entries.length) changed = true
      if (nextEntries.length) {
        this.contributions.set(area, nextEntries)
      } else {
        this.contributions.delete(area)
      }
    }

    if (changed) {
      this.emit('contribution:changed', this.getContributionMap())
    }
  }

  disposeRecord(record) {
    while (record.disposables.length) {
      const dispose = record.disposables.pop()
      try {
        dispose()
      } catch (error) {
        this.logger.warn('addon cleanup failed', {
          id: record.manifest.id,
          error: normalizeError(error)
        })
      }
    }
  }

  requireRecord(id) {
    const record = this.records.get(id)
    if (!record) throw new Error(`Unknown addon: ${id}`)
    return record
  }

  emit(eventName, payload) {
    for (const listener of this.listeners.get(eventName) || []) {
      try {
        listener(payload)
      } catch (error) {
        this.logger.warn('addon listener failed', { eventName, error: normalizeError(error) })
      }
    }
  }
}
