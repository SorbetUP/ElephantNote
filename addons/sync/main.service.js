import ElephantSyncAddonBase from './main.js'

const ADDON_ID = 'elephant.sync'
const SERVICE_RESOURCE = 'sync.native-service'
const NATIVE_COMMANDS = new Set([
  'iroh_sync_status',
  'iroh_sync_create_invite',
  'iroh_sync_accept_invite',
  'iroh_sync_run',
  'iroh_sync_shutdown',
  'iroh_sync_conflict_settings_get',
  'iroh_sync_conflict_settings_set',
  'iroh_sync_conflict_restore',
  'iroh_sync_conflict_delete'
])

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
      const state = service?.pairingState === 'paired' ? 'idle' : service?.pairingState || 'idle'
      return { available: true, state, ...service }
    } catch (error) {
      return { available: false, state: 'error', error: error?.message || String(error) }
    }
  }

  createNativeInvite(params = {}) {
    return this.callNativeService('sync.create-invite', params, { timeoutMs: 30_000 })
  }

  acceptNativeInvite(invite) {
    if (!invite) throw new TypeError('A Sync invite is required')
    let params = invite
    if (typeof invite === 'string') params = { manualCode: invite }
    else if (typeof invite?.invite === 'string') params = { manualCode: invite.invite }
    return this.callNativeService('sync.accept-invite', params, { timeoutMs: 60_000 })
  }

  runNativeSync() {
    return this.callNativeService('sync.run', {}, { timeoutMs: 30 * 60_000 })
  }

  scanNativeVault() {
    return this.callNativeService('sync.scan', {}, { timeoutMs: 120_000 })
  }

  buildNativePlan(params = {}) {
    return this.callNativeService('sync.plan', params, { timeoutMs: 120_000 })
  }

  applyNativeLocalPlan(plan) {
    if (!plan || typeof plan !== 'object') throw new TypeError('A Sync plan is required')
    return this.callNativeService('sync.apply-local', { plan }, { timeoutMs: 120_000 })
  }

  nativeConflictStatus(cleanup = true) {
    return this.callNativeService(cleanup ? 'sync.conflicts.get' : 'sync.conflicts.peek')
  }

  setNativeConflictRetention(retentionDays) {
    return this.callNativeService('sync.conflicts.set', { retentionDays })
  }

  restoreNativeConflict(relativePath) {
    return this.callNativeService('sync.conflicts.restore', { relativePath })
  }

  deleteNativeConflict(relativePath) {
    return this.callNativeService('sync.conflicts.delete', { relativePath })
  }

  async invoke(command, payload = {}) {
    if (!NATIVE_COMMANDS.has(command)) return await super.invoke(command, payload)
    if (command === 'iroh_sync_status') return await this.nativeStatus()
    if (command === 'iroh_sync_create_invite') {
      const result = await this.createNativeInvite(payload)
      return { ...result, rawInvite: result?.invite, invite: result?.qrPayload || result?.manualCode || result?.invite }
    }
    if (command === 'iroh_sync_accept_invite') return await this.acceptNativeInvite(payload)
    if (command === 'iroh_sync_run') return await this.runNativeSync()
    if (command === 'iroh_sync_shutdown') return await this.stopNativeService()
    if (command === 'iroh_sync_conflict_settings_get') return await this.nativeConflictStatus(true)
    if (command === 'iroh_sync_conflict_settings_set') {
      return await this.setNativeConflictRetention(payload.conflictRetentionDays ?? payload.retentionDays)
    }
    if (command === 'iroh_sync_conflict_restore') {
      return await this.restoreNativeConflict(payload.relativePath ?? payload.path)
    }
    if (command === 'iroh_sync_conflict_delete') {
      return await this.deleteNativeConflict(payload.relativePath ?? payload.path)
    }
    return await super.invoke(command, payload)
  }

  async onload(api) {
    const started = await this.startNativeService()
    await super.onload(api)
    const status = await this.nativeStatus()
    api.resources.provide(SERVICE_RESOURCE, Object.freeze({
      start: () => this.startNativeService(),
      status: () => this.nativeStatus(),
      endpoint: () => this.callNativeService('sync.endpoint'),
      createInvite: (params = {}) => this.createNativeInvite(params),
      acceptInvite: (invite) => this.acceptNativeInvite(invite),
      run: () => this.runNativeSync(),
      scan: () => this.scanNativeVault(),
      plan: (params = {}) => this.buildNativePlan(params),
      applyLocal: (plan) => this.applyNativeLocalPlan(plan),
      conflicts: Object.freeze({
        status: (cleanup = true) => this.nativeConflictStatus(cleanup),
        setRetention: (retentionDays) => this.setNativeConflictRetention(retentionDays),
        restore: (relativePath) => this.restoreNativeConflict(relativePath),
        delete: (relativePath) => this.deleteNativeConflict(relativePath)
      }),
      stop: () => this.stopNativeService(),
      capabilities: Object.freeze([
        'endpoint',
        'identity',
        'wire-protocol',
        'pairing',
        'manifest',
        'plan',
        'local-operations',
        'file-streams',
        'sync-sessions',
        'conflict-archive'
      ])
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
