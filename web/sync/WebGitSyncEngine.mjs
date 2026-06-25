import { execFile } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { promisify } from 'util'
import {
  SYNC_BACKENDS,
  SYNC_CONFIG_FILE,
  SYNC_DEFAULT_REMOTE,
  SYNC_HISTORY_FILE,
  SYNC_LEGACY_METADATA_DIR,
  SYNC_METADATA_DIR,
  SYNC_OPERATIONS,
  SYNC_STATUSES,
  createDefaultSyncPlan,
  createSyncConfig,
  createSyncHistoryRecord,
  createSyncQueueItem,
  createSyncStatus,
  createUnknownSyncOperationError
} from '../../Elephant/shared/sync.js'

const execFileAsync = promisify(execFile)
const MAX_QUEUE_ITEMS = 100

const pathExists = async(target) => fs.access(target).then(() => true, () => false)
const ensureDir = async(target) => fs.mkdir(target, { recursive: true })
const readJson = async(target) => JSON.parse(await fs.readFile(target, 'utf8'))
const outputFile = async(target, content) => {
  await ensureDir(path.dirname(target))
  await fs.writeFile(target, content, 'utf8')
}
const outputJson = async(target, value) => outputFile(target, `${JSON.stringify(value, null, 2)}\n`)

const appendMissingLines = async(target, lines) => {
  await ensureDir(path.dirname(target))
  const existing = await fs.readFile(target, 'utf8').catch(() => '')
  const existingLines = new Set(existing.split('\n').map((line) => line.trim()).filter(Boolean))
  const missing = lines.filter((line) => !existingLines.has(line))
  if (!missing.length) return
  const prefix = existing && !existing.endsWith('\n') ? '\n' : ''
  await fs.appendFile(target, `${prefix}${missing.join('\n')}\n`, 'utf8')
}

const normalizeQueueInput = (operationOrPlanItem = {}) => (
  typeof operationOrPlanItem === 'string'
    ? { operation: operationOrPlanItem }
    : operationOrPlanItem
)

const readMetadataJson = async(metadataPath, legacyMetadataPath) => (
  readJson(metadataPath).catch(() => readJson(legacyMetadataPath).catch(() => null))
)

const SYNC_LOCAL_METADATA_FILES = Object.freeze([
  `${SYNC_METADATA_DIR}/${SYNC_CONFIG_FILE}`,
  `${SYNC_METADATA_DIR}/${SYNC_HISTORY_FILE}`
])
const SYNC_LEGACY_LOCAL_METADATA_FILES = Object.freeze([
  `${SYNC_LEGACY_METADATA_DIR}/${SYNC_CONFIG_FILE}`,
  `${SYNC_LEGACY_METADATA_DIR}/${SYNC_HISTORY_FILE}`
])
const ALL_LOCAL_METADATA_FILES = Object.freeze([
  ...SYNC_LOCAL_METADATA_FILES,
  ...SYNC_LEGACY_LOCAL_METADATA_FILES
])

export class WebGitSyncEngine {
  constructor({ cwd, executor = execFileAsync } = {}) {
    this.cwd = cwd
    this.executor = executor
    this.queue = []
    this.history = []
    this.running = false
    this.lastRunAt = ''
    this.lastError = ''
    this.config = null
    this.repository = {}
  }

  metadataPath(file) {
    return path.join(this.cwd, SYNC_METADATA_DIR, file)
  }

  legacyMetadataPath(file) {
    return path.join(this.cwd, SYNC_LEGACY_METADATA_DIR, file)
  }

  async readMetadataJson(file) {
    return readMetadataJson(this.metadataPath(file), this.legacyMetadataPath(file))
  }

  async untrackSyncMetadata() {
    await this.git(['rm', '--cached', '--ignore-unmatch', ...ALL_LOCAL_METADATA_FILES]).catch((error) => {
      throw new Error(`Failed to untrack local sync metadata: ${error.message || error}`)
    })
  }

  compactQueue() {
    const active = this.queue.filter((item) => item.status === SYNC_STATUSES.QUEUED || item.status === SYNC_STATUSES.RUNNING)
    const completed = this.queue.filter((item) => item.status !== SYNC_STATUSES.QUEUED && item.status !== SYNC_STATUSES.RUNNING)
    this.queue = [...completed.slice(-MAX_QUEUE_ITEMS), ...active]
  }

  enqueue(operationOrPlanItem) {
    const item = createSyncQueueItem(normalizeQueueInput(operationOrPlanItem), new Date(), { strict: false })
    this.queue.push(item)
    this.compactQueue()
    return item
  }

  status() {
    return createSyncStatus({
      cwd: this.cwd,
      running: this.running,
      queue: this.queue,
      history: this.history,
      lastRunAt: this.lastRunAt,
      lastError: this.lastError,
      config: this.config,
      repository: this.repository
    })
  }

  async run(payloadByOperation = {}) {
    if (this.running) return this.status()
    for (const operation of createDefaultSyncPlan(payloadByOperation)) this.enqueue(operation)

    this.running = true
    this.lastError = ''
    try {
      for (const item of this.queue.filter((candidate) => candidate.status === SYNC_STATUSES.QUEUED)) {
        await this.runItem(item)
      }
      await this.refresh()
      this.lastRunAt = new Date().toISOString()
      this.running = false
      this.compactQueue()
      return this.status()
    } catch (error) {
      this.lastError = error.message || 'Sync failed.'
      throw error
    } finally {
      this.running = false
      this.compactQueue()
    }
  }

  async runItem(item) {
    item.status = SYNC_STATUSES.RUNNING
    item.updatedAt = new Date().toISOString()
    try {
      if (item.operation === SYNC_OPERATIONS.INIT) await this.init(item.payload)
      else if (item.operation === SYNC_OPERATIONS.SNAPSHOT) await this.snapshot(item.payload)
      else if (item.operation === SYNC_OPERATIONS.PULL) await this.pull(item.payload)
      else if (item.operation === SYNC_OPERATIONS.PUSH) await this.push(item.payload)
      else throw createUnknownSyncOperationError(item.operation)
      item.status = SYNC_STATUSES.DONE
    } catch (error) {
      item.status = SYNC_STATUSES.ERROR
      item.error = error.message || 'Sync operation failed.'
      throw error
    } finally {
      item.updatedAt = new Date().toISOString()
      await this.recordHistory(item)
    }
  }

  async git(args) {
    return this.executor('git', args, { cwd: this.cwd })
  }

  async init({ remote = '', remoteName = '', branch = '' } = {}) {
    await ensureDir(this.cwd)
    if (!await pathExists(path.join(this.cwd, '.git'))) await this.git(['init'])
    await this.ensureGitIdentity()

    this.config = await this.readMetadataJson(SYNC_CONFIG_FILE)
    this.config = {
      ...createSyncConfig({
        cwd: this.cwd,
        hostname: os.hostname(),
        backend: SYNC_BACKENDS.GIT,
        remote: remote || this.config?.remote || '',
        remoteName: remoteName || this.config?.remoteName || SYNC_DEFAULT_REMOTE,
        branch: branch || this.config?.branch || '',
        peers: this.config?.peers || []
      }),
      deviceId: this.config?.deviceId || createSyncConfig({ cwd: this.cwd, hostname: os.hostname() }).deviceId,
      folderId: this.config?.folderId || createSyncConfig({ cwd: this.cwd, hostname: os.hostname() }).folderId
    }

    if (this.config.remote) await this.upsertRemote(this.config.remoteName, this.config.remote)
    await outputJson(this.metadataPath(SYNC_CONFIG_FILE), this.config)
    await this.ensureGitExclude()
    await this.untrackSyncMetadata()
  }

  async snapshot({ message = '' } = {}) {
    await this.ensureReady()
    const status = await this.git(['status', '--short'])
    if (!status.stdout.trim()) return { committed: false }
    await this.git(['add', '-A'])
    await this.git(['commit', '-m', message || `ElephantNote sync snapshot ${new Date().toISOString()}`])
    return { committed: true }
  }

  async pull({ remoteName = '', branch = '' } = {}) {
    await this.ensureReady()
    const targetRemote = remoteName || this.config?.remoteName || SYNC_DEFAULT_REMOTE
    if (!this.config?.remote && !await this.hasRemote(targetRemote)) return
    await this.git(['pull', '--ff-only', targetRemote, branch || this.config?.branch || await this.branch()])
  }

  async push({ remoteName = '', branch = '' } = {}) {
    await this.ensureReady()
    const targetRemote = remoteName || this.config?.remoteName || SYNC_DEFAULT_REMOTE
    if (!this.config?.remote && !await this.hasRemote(targetRemote)) return
    await this.git(['push', '-u', targetRemote, branch || this.config?.branch || await this.branch()])
  }

  async ensureReady() {
    if (!await pathExists(path.join(this.cwd, '.git'))) {
      await this.init()
    } else if (!this.config) {
      this.config = await this.readMetadataJson(SYNC_CONFIG_FILE)
      if (!this.config) await this.init()
    }
  }

  async ensureGitExclude() {
    await appendMissingLines(path.join(this.cwd, '.git', 'info', 'exclude'), ALL_LOCAL_METADATA_FILES.map((file) => `/${file}`))
  }

  async upsertRemote(remoteName, remote) {
    const exists = await this.hasRemote(remoteName)
    await this.git(exists ? ['remote', 'set-url', remoteName, remote] : ['remote', 'add', remoteName, remote])
  }

  async hasRemote(remoteName) {
    return this.git(['remote', 'get-url', remoteName]).then(() => true, () => false)
  }

  async ensureGitIdentity() {
    const hasName = await this.git(['config', 'user.name']).then((result) => Boolean(result.stdout.trim()), () => false)
    const hasEmail = await this.git(['config', 'user.email']).then((result) => Boolean(result.stdout.trim()), () => false)
    if (!hasName) await this.git(['config', 'user.name', 'ElephantNote Sync'])
    if (!hasEmail) await this.git(['config', 'user.email', 'sync@elephantnote.local'])
  }

  async branch() {
    return (await this.git(['branch', '--show-current']).catch(() => ({ stdout: '' }))).stdout.trim() || 'main'
  }

  async refresh() {
    if (!await pathExists(path.join(this.cwd, '.git'))) return
    const status = await this.git(['status', '--short', '--branch']).catch(() => ({ stdout: '' }))
    const branchLine = status.stdout.split('\n')[0] || ''
    this.repository = {
      branch: await this.branch(),
      ahead: Number(branchLine.match(/ahead (\d+)/)?.[1] || 0),
      behind: Number(branchLine.match(/behind (\d+)/)?.[1] || 0),
      dirty: status.stdout.split('\n').slice(1).some(Boolean)
    }
  }

  async recordHistory(item) {
    this.history = [...this.history, createSyncHistoryRecord(item)].slice(-200)
    await outputJson(this.metadataPath(SYNC_HISTORY_FILE), {
      version: 1,
      updatedAt: new Date().toISOString(),
      history: this.history
    }).catch(() => {})
  }
}
