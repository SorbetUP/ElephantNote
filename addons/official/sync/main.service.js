import ElephantSyncAddonBase from './main.js'

const ADDON_ID = 'elephant.sync'
const SERVICE_RESOURCE = 'sync.native-service'

export default class ElephantSyncServiceAddon extends ElephantSyncAddonBase {
  async serviceInvoke(command, payload = {}) {
    const invoke = this.window?.__TAURI__?.core?.invoke
    if (typeof invoke !== 'function') throw new Error(`Tauri command API is unavailable for ${command}`)
    return await invoke(command, { addonId: ADDON_ID, ...payload })
  }

  async startNativeService() {
    if (this.api.native?.service?.start) return await this.api.native.service.start()
    return await this.serviceInvoke('tauri_addons_service_start')
  }

  async callNativeService(method, params = {}, options = {}) {
    if (this.api.native?.service?.call) return await this.api.native.service.call(method, params, options)
    return await this.serviceInvoke('tauri_addons_service_call', {
      method,
      params,
      timeoutMs: options.timeoutMs
    })
  }

  async stopNativeService() {
    if (this.api.native?.service?.stop) return await this.api.native.service.stop()
    return await this.serviceInvoke('tauri_addons_service_stop')
  }

  async nativeStatus() {
    try {
      const service = await this.callNativeService('sync.status')
      return { available: true, ...service }
    } catch (error) {
      return { available: false, error: error?.message || String(error) }
    }
  }

  async scanNativeVault() {
    return await this.callNativeService('sync.scan', {}, { timeoutMs: 120_000 })
  }

  async buildNativePlan(params = {}) {
    return await this.callNativeService('sync.plan', params, { timeoutMs: 120_000 })
  }

  async applyNativeLocalPlan(plan) {
    if (!plan || typeof plan !== 'object') throw new TypeError('A Sync plan is required')
    return await this.callNativeService('sync.apply-local', { plan }, { timeoutMs: 120_000 })
  }

  async onload(api) {
    await super.onload(api)
    const started = await this.startNativeService()
    const status = await this.nativeStatus()
    api.resources.provide(SERVICE_RESOURCE, Object.freeze({
      start: () => this.startNativeService(),
      status: () => this.nativeStatus(),
      endpoint: () => this.callNativeService('sync.endpoint'),
      scan: () => this.scanNativeVault(),
      plan: (params = {}) => this.buildNativePlan(params),
      applyLocal: (plan) => this.applyNativeLocalPlan(plan),
      stop: () => this.stopNativeService(),
      capabilities: Object.freeze(['endpoint', 'identity', 'manifest', 'plan', 'local-operations'])
    }))
    api.app.emit('elephantnote:sync-native-service-ready', { started, status })
  }

  async onunload() {
    await Promise.allSettled([
      Promise.resolve(super.onunload()),
      this.stopNativeService()
    ])
  }
}
