export class RcloneManager {
  constructor({ binaryPath = '', executor = null } = {}) {
    this.binaryPath = binaryPath
    this.executor = executor
    this.lastError = ''
  }

  configure({ binaryPath = '' } = {}) {
    if (binaryPath !== undefined) this.binaryPath = String(binaryPath || '').trim()
  }
}
