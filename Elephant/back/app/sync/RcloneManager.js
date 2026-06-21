export class RcloneManager {
  constructor({ binaryPath = '', executor = null } = {}) {
    this.binaryPath = binaryPath
    this.executor = executor
    this.lastError = ''
  }

  configure({ binaryPath = '' } = {}) {
    if (binaryPath !== undefined) this.binaryPath = String(binaryPath || '').trim()
  }

  async resolveBinary() {
    return this.binaryPath || 'rclone'
  }

  async run(args = [], options = {}) {
    if (!this.executor) {
      throw new Error('Rclone execution backend is not configured.')
    }
    const binary = await this.resolveBinary()
    try {
      const result = await this.executor(binary, args, options)
      this.lastError = ''
      return {
        binary,
        args,
        stdout: result?.stdout || '',
        stderr: result?.stderr || ''
      }
    } catch (error) {
      this.lastError = error?.message || 'rclone command failed.'
      throw error
    }
  }

  async version() {
    const result = await this.run(['version'], { timeout: 30_000 })
    return result.stdout.split('\n')[0] || result.stdout.trim()
  }
}
