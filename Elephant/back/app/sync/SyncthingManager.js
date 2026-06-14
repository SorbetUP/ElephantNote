import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs-extra'

const DEFAULT_ENDPOINT = 'http://127.0.0.1:8384'

const normalizeEndpoint = (endpoint = DEFAULT_ENDPOINT) =>
  String(endpoint || DEFAULT_ENDPOINT).replace(/\/+$/, '')

const parseJson = async(response) => {
  const text = await response.text()
  if (!text) return {}
  return JSON.parse(text)
}

export class SyncthingManager {
  constructor({
    endpoint = DEFAULT_ENDPOINT,
    apiKey = '',
    binaryPath = '',
    fetchImpl = globalThis.fetch,
    spawnImpl = spawn
  } = {}) {
    this.endpoint = normalizeEndpoint(endpoint)
    this.apiKey = apiKey
    this.binaryPath = binaryPath
    this.fetchImpl = fetchImpl
    this.spawnImpl = spawnImpl
    this.process = null
    this.lastError = ''
  }

  configure({ endpoint = '', apiKey = '', binaryPath = '' } = {}) {
    if (endpoint) this.endpoint = normalizeEndpoint(endpoint)
    if (apiKey !== undefined) this.apiKey = apiKey
    if (binaryPath) this.binaryPath = binaryPath
  }

  status() {
    return {
      configured: Boolean(this.endpoint),
      connected: false,
      endpoint: this.endpoint,
      folderState: '',
      lastError: this.lastError
    }
  }

  async start({ cwd = '', binaryPath = '', homeDir = '' } = {}) {
    const executable = binaryPath || this.binaryPath || await this.resolveBundledBinary()
    if (!executable) {
      throw new Error('Syncthing binary is not configured.')
    }

    const args = ['--no-browser']
    if (homeDir) args.push('--home', homeDir)

    this.process = this.spawnImpl(executable, args, {
      cwd: cwd || path.dirname(executable),
      stdio: 'ignore',
      detached: true
    })
    this.process.unref?.()
    return this.process
  }

  async request(method, pathname, body = null) {
    if (!this.fetchImpl) throw new Error('Syncthing REST transport is not available.')
    const response = await this.fetchImpl(`${this.endpoint}${pathname}`, {
      method,
      headers: {
        ...(this.apiKey ? { 'X-API-Key': this.apiKey } : {}),
        ...(body ? { 'content-type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    })
    if (!response.ok) {
      throw new Error(`Syncthing API returned HTTP ${response.status}.`)
    }
    return parseJson(response)
  }

  async ping() {
    try {
      const system = await this.request('GET', '/rest/system/status')
      this.lastError = ''
      return {
        ...this.status(),
        connected: true,
        myID: system.myID || '',
        localDeviceId: system.myID || ''
      }
    } catch (error) {
      this.lastError = error?.message || 'Syncthing is not reachable.'
      return this.status()
    }
  }

  async ensureFolder({ folderId, label = '', path: folderPath, type = 'sendreceive' } = {}) {
    if (!folderId) throw new Error('Syncthing folderId is required.')
    if (!folderPath) throw new Error('Syncthing folder path is required.')

    const config = await this.request('GET', '/rest/config')
    const folders = Array.isArray(config.folders) ? config.folders : []
    const nextFolder = {
      id: folderId,
      label: label || folderId,
      path: folderPath,
      type,
      devices: folders.find((folder) => folder.id === folderId)?.devices || []
    }
    const nextConfig = {
      ...config,
      folders: [
        ...folders.filter((folder) => folder.id !== folderId),
        nextFolder
      ]
    }

    await this.request('PUT', '/rest/config', nextConfig)
    this.lastError = ''
    return nextFolder
  }

  async ensurePeer({ deviceId = '', name = '', address = 'dynamic', folderId = '' } = {}) {
    const normalizedDeviceId = String(deviceId || '').trim()
    if (!normalizedDeviceId) return null

    const normalizedAddress = String(address || 'dynamic').trim() || 'dynamic'
    const config = await this.request('GET', '/rest/config')
    const devices = Array.isArray(config.devices) ? config.devices : []
    const folders = Array.isArray(config.folders) ? config.folders : []
    const existingDevice = devices.find((device) => device.deviceID === normalizedDeviceId)
    const nextDevice = {
      ...(existingDevice || {}),
      deviceID: normalizedDeviceId,
      name: name || existingDevice?.name || normalizedDeviceId.slice(0, 12),
      addresses: [normalizedAddress],
      introducer: false,
      autoAcceptFolders: false
    }
    const nextFolders = folders.map((folder) => {
      if (folder.id !== folderId) return folder
      const folderDevices = Array.isArray(folder.devices) ? folder.devices : []
      return {
        ...folder,
        devices: [
          ...folderDevices.filter((device) => device.deviceID !== normalizedDeviceId),
          { deviceID: normalizedDeviceId }
        ]
      }
    })

    await this.request('PUT', '/rest/config', {
      ...config,
      devices: [
        ...devices.filter((device) => device.deviceID !== normalizedDeviceId),
        nextDevice
      ],
      folders: nextFolders
    })
    this.lastError = ''
    return {
      deviceId: normalizedDeviceId,
      name: nextDevice.name,
      address: normalizedAddress
    }
  }

  async folderStatus(folderId) {
    if (!folderId) return this.status()
    try {
      const data = await this.request('GET', `/rest/db/status?folder=${encodeURIComponent(folderId)}`)
      this.lastError = ''
      return {
        ...this.status(),
        connected: true,
        localDeviceId: data.myID || '',
        folderState: data.state || ''
      }
    } catch (error) {
      this.lastError = error?.message || 'Syncthing folder status failed.'
      return this.status()
    }
  }

  async resolveBundledBinary() {
    const platform = process.platform === 'win32' ? 'win-x64' : `${process.platform}-${process.arch}`
    const executable = process.platform === 'win32' ? 'syncthing.exe' : 'syncthing'
    const candidate = path.join(process.resourcesPath || '', 'syncthing', platform, executable)
    return await fs.pathExists(candidate) ? candidate : ''
  }
}
