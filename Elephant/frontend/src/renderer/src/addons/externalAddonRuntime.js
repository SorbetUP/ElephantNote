const getTauriCore = (target = globalThis) => target?.__TAURI__?.core || null

const invoke = (command, payload = {}, target = globalThis) => {
  const core = getTauriCore(target)
  if (!core?.invoke) throw new Error(`Tauri command API is unavailable for ${command}`)
  return core.invoke(command, payload)
}

const externalApi = Object.freeze({
  list: () => invoke('tauri_addons_list'),
  install: (packagePath) => invoke('tauri_addons_install', { packagePath }),
  uninstall: (addonId) => invoke('tauri_addons_uninstall', { addonId }),
  setEnabled: (addonId, enabled) => invoke('tauri_addons_set_enabled', { addonId, enabled }),
  readEntry: (addonId) => invoke('tauri_addons_read_entry', { addonId }),
  call: (addonId, method, params = {}) => invoke('tauri_addons_call', { addonId, method, params })
})

const asError = (value, fallback = 'External addon operation failed') => {
  if (value instanceof Error) return value
  if (value && typeof value === 'object' && typeof value.message === 'string') {
    const error = new Error(value.message)
    error.name = value.name || 'Error'
    if (value.stack) error.stack = value.stack
    return error
  }
  return new Error(typeof value === 'string' && value ? value : fallback)
}

const safeString = (value, fallback = '') => (typeof value === 'string' ? value.trim() || fallback : fallback)

const createWorkerSource = (entrySource, addonId) => `
'use strict';
const __elephantNativePostMessage = self.postMessage.bind(self);
const __elephantDisableGlobal = (name) => {
  try {
    Object.defineProperty(self, name, { value: undefined, writable: false, configurable: false });
  } catch (_) {
    try { self[name] = undefined; } catch (_) {}
  }
};
[
  'fetch', 'WebSocket', 'EventSource', 'XMLHttpRequest', 'importScripts',
  'Worker', 'SharedWorker', 'BroadcastChannel', 'indexedDB', 'caches'
].forEach(__elephantDisableGlobal);
try {
  Object.defineProperty(self, '__TAURI__', { value: undefined, writable: false, configurable: false });
  Object.defineProperty(self, 'postMessage', { value: __elephantNativePostMessage, writable: false, configurable: false });
} catch (_) {}

${entrySource}

(() => {
  const addonId = ${JSON.stringify(addonId)};
  const definition = self.elephantAddon;
  const pendingRpc = new Map();
  const commands = new Map();
  let nextRpcId = 1;
  let disposeActivation = null;

  const post = (message) => __elephantNativePostMessage(message);
  const serializeError = (error) => ({
    name: error?.name || 'Error',
    message: error?.message || String(error),
    stack: error?.stack || ''
  });

  const rpc = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextRpcId++;
    pendingRpc.set(id, { resolve, reject });
    post({ type: 'rpc', id, method, params });
  });

  const registerCommand = (command) => {
    if (!command || typeof command !== 'object') throw new TypeError('Command definition is required');
    const id = String(command.id || '').trim();
    if (!id || !id.startsWith(addonId + '.')) {
      throw new Error('External addon command ids must start with ' + addonId + '.');
    }
    if (typeof command.run !== 'function') throw new TypeError('Command run handler is required');
    commands.set(id, command.run);
    post({
      type: 'register-action',
      action: {
        id,
        title: String(command.title || id),
        description: String(command.description || ''),
        order: Number.isFinite(command.order) ? command.order : 0
      }
    });
    return () => commands.delete(id);
  };

  const api = Object.freeze({
    app: Object.freeze({ info: () => rpc('app.info') }),
    notes: Object.freeze({
      read: (path) => rpc('notes.read', { path }),
      write: (path, content) => rpc('notes.write', { path, content })
    }),
    http: Object.freeze({
      request: (request) => rpc('http.request', request || {})
    }),
    storage: Object.freeze({
      get: (key) => rpc('storage.get', { key }),
      set: (key, value) => rpc('storage.set', { key, value }),
      remove: (key) => rpc('storage.remove', { key }),
      entries: () => rpc('storage.entries')
    }),
    commands: Object.freeze({ register: registerCommand })
  });

  self.onmessage = async (event) => {
    const message = event?.data || {};
    if (message.type === 'rpc-result') {
      const pending = pendingRpc.get(message.id);
      if (!pending) return;
      pendingRpc.delete(message.id);
      if (message.ok) pending.resolve(message.result);
      else pending.reject(new Error(message.error?.message || message.error || 'Addon API call failed'));
      return;
    }

    if (message.type === 'activate') {
      try {
        if (!definition || typeof definition.activate !== 'function') {
          throw new Error('Addon entry must assign self.elephantAddon = { activate(api) { ... } }');
        }
        const dispose = await definition.activate(api);
        if (typeof dispose === 'function') disposeActivation = dispose;
        post({ type: 'activation-result', id: message.id, ok: true });
      } catch (error) {
        post({ type: 'activation-result', id: message.id, ok: false, error: serializeError(error) });
      }
      return;
    }

    if (message.type === 'run-command') {
      try {
        const run = commands.get(message.commandId);
        if (!run) throw new Error('Unknown addon command: ' + message.commandId);
        const result = await run(message.payload);
        post({ type: 'command-result', id: message.id, ok: true, result });
      } catch (error) {
        post({ type: 'command-result', id: message.id, ok: false, error: serializeError(error) });
      }
      return;
    }

    if (message.type === 'deactivate') {
      try {
        if (typeof definition?.deactivate === 'function') await definition.deactivate(api);
        if (typeof disposeActivation === 'function') await disposeActivation();
        post({ type: 'deactivation-result', id: message.id, ok: true });
      } catch (error) {
        post({ type: 'deactivation-result', id: message.id, ok: false, error: serializeError(error) });
      }
    }
  };
})();
`

class ExternalAddonSession {
  constructor(record, logger) {
    this.record = record
    this.addonId = record.manifest.id
    this.logger = logger
    this.worker = null
    this.workerUrl = ''
    this.context = null
    this.pending = new Map()
    this.nextRequestId = 1
    this.disposed = false
  }

  async start(context) {
    if (this.worker) return
    this.context = context
    const entry = await externalApi.readEntry(this.addonId)
    const source = safeString(entry?.source)
    if (!source) throw new Error(`External addon ${this.addonId} has an empty entry file`)

    const blob = new Blob([createWorkerSource(source, this.addonId)], { type: 'text/javascript' })
    this.workerUrl = URL.createObjectURL(blob)
    this.worker = new Worker(this.workerUrl, { name: `elephant-addon:${this.addonId}` })
    this.worker.addEventListener('message', (event) => this.handleMessage(event?.data || {}))
    this.worker.addEventListener('error', (event) => {
      const error = new Error(event?.message || `External addon worker crashed: ${this.addonId}`)
      this.rejectAll(error)
      this.logger?.error?.('external addon worker crashed', { id: this.addonId, error: error.message })
    })

    await this.request('activate', {}, 10_000)
  }

  handleMessage(message) {
    if (message.type === 'rpc') {
      void externalApi.call(this.addonId, message.method, message.params || {})
        .then((result) => this.post({ type: 'rpc-result', id: message.id, ok: true, result }))
        .catch((error) => this.post({
          type: 'rpc-result',
          id: message.id,
          ok: false,
          error: { name: error?.name || 'Error', message: error?.message || String(error) }
        }))
      return
    }

    if (message.type === 'register-action') {
      this.registerAction(message.action)
      return
    }

    if (message.type?.endsWith('-result')) {
      const pending = this.pending.get(message.id)
      if (!pending) return
      clearTimeout(pending.timeout)
      this.pending.delete(message.id)
      if (message.ok) pending.resolve(message.result)
      else pending.reject(asError(message.error))
    }
  }

  registerAction(action = {}) {
    if (!this.record.manifest.permissions?.commands) {
      this.logger?.warn?.('external addon attempted to register a command without permission', { id: this.addonId })
      return
    }
    const id = safeString(action.id)
    if (!id.startsWith(`${this.addonId}.`)) {
      this.logger?.warn?.('external addon registered an invalid command id', { addonId: this.addonId, id })
      return
    }
    this.context.addAction({
      id,
      title: safeString(action.title, id),
      description: safeString(action.description),
      order: Number.isFinite(action.order) ? action.order : 0,
      run: (payload) => this.request('run-command', { commandId: id, payload }, 30_000)
    })
  }

  request(type, payload = {}, timeoutMs = 10_000) {
    if (!this.worker || this.disposed) return Promise.reject(new Error(`External addon worker is not running: ${this.addonId}`))
    const id = this.nextRequestId++
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        this.dispose()
        reject(new Error(`External addon ${this.addonId} timed out during ${type}`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timeout })
      this.post({ type, id, ...payload })
    })
  }

  post(message) {
    this.worker?.postMessage(message)
  }

  rejectAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(error)
    }
    this.pending.clear()
  }

  async stop() {
    if (!this.worker || this.disposed) return
    try {
      await this.request('deactivate', {}, 3_000)
    } catch (error) {
      this.logger?.warn?.('external addon deactivation failed', { id: this.addonId, error: error?.message || String(error) })
    } finally {
      this.dispose()
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.rejectAll(new Error(`External addon worker stopped: ${this.addonId}`))
    this.worker?.terminate()
    this.worker = null
    if (this.workerUrl) URL.revokeObjectURL(this.workerUrl)
    this.workerUrl = ''
  }
}

const createExternalAddonDefinition = (record, logger) => {
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
      session = new ExternalAddonSession(record, logger)
      try {
        await session.start(context)
        await externalApi.setEnabled(record.manifest.id, true)
      } catch (error) {
        session.dispose()
        session = null
        await externalApi.setEnabled(record.manifest.id, false).catch(() => {})
        throw error
      }
      return () => session?.dispose()
    },
    async deactivate() {
      await session?.stop()
      session = null
      await externalApi.setEnabled(record.manifest.id, false)
    }
  }
}

export class ExternalAddonController {
  constructor(manager, options = {}) {
    this.manager = manager
    this.logger = options.logger
    this.records = new Map()
  }

  async load() {
    const records = await externalApi.list()
    for (const record of records) this.register(record)
    for (const record of records) {
      if (!record.enabled) continue
      try {
        await this.manager.enable(record.manifest.id)
      } catch (error) {
        this.logger?.error?.('external addon startup failed', { id: record.manifest.id, error: error?.message || String(error) })
      }
    }
    return records
  }

  register(record) {
    const id = record?.manifest?.id
    if (!id) throw new Error('External addon record has no id')
    if (this.manager.get(id)) return this.manager.get(id)
    this.records.set(id, record)
    return this.manager.register(createExternalAddonDefinition(record, this.logger))
  }

  async installFromPath(packagePath) {
    const record = await externalApi.install(packagePath)
    if (this.manager.get(record.manifest.id)) {
      await this.manager.disable(record.manifest.id).catch(() => {})
      this.manager.unregister(record.manifest.id)
    }
    this.register(record)
    return record
  }

  async uninstall(addonId) {
    const snapshot = this.manager.get(addonId)
    if (snapshot?.enabled || snapshot?.status === 'error') {
      await this.manager.disable(addonId).catch(() => {})
    }
    await externalApi.uninstall(addonId)
    this.manager.unregister(addonId)
    this.records.delete(addonId)
  }
}

export const installExternalAddonRuntime = (manager, options = {}) => {
  const controller = new ExternalAddonController(manager, options)
  manager.external = controller
  void controller.load().catch((error) => {
    manager.logger.error('external addon registry failed to load', error)
  })
  return controller
}
