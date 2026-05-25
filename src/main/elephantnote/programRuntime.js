import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export const normalizeProgramEnvironments = (environments = {}) => {
  return Object.fromEntries(Object.entries(environments || {}).map(([id, env = {}]) => [
    String(id).trim(),
    {
      name: String(env.name || id).trim(),
      commandPrefix: Array.isArray(env.commandPrefix)
        ? env.commandPrefix.map((part) => String(part)).filter(Boolean)
        : [],
      env: env.env && typeof env.env === 'object' && !Array.isArray(env.env)
        ? Object.fromEntries(Object.entries(env.env).map(([key, value]) => [key, String(value)]))
        : {}
    }
  ]).filter(([id]) => id))
}

export class ProgramRuntime {
  constructor({ executor = execFileAsync } = {}) {
    this.executor = executor
  }

  async run({ environment, command, cwd = '', baseEnv = process.env }) {
    const normalizedCommand = String(command || '').trim()
    if (!normalizedCommand) throw new Error('Command is required.')
    const parts = [...(environment.commandPrefix || []), ...normalizedCommand.split(/\s+/).filter(Boolean)]
    const binary = parts.shift()
    if (!binary) throw new Error('Command is required.')
    const result = await this.executor(binary, parts, {
      cwd: cwd || process.cwd(),
      env: {
        ...baseEnv,
        ...(environment.env || {})
      },
      timeout: 10 * 60 * 1000
    })
    return {
      stdout: result.stdout || '',
      stderr: result.stderr || ''
    }
  }
}
