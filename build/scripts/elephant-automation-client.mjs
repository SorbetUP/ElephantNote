#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const normalizeEndpoint = (value) => String(value || '').replace(/\/+$/, '')
const parseJson = (value, fallback) => {
  if (value === undefined || value === '') return fallback
  if (value.startsWith('@')) return JSON.parse(readFileSync(value.slice(1), 'utf8'))
  return JSON.parse(value)
}

export class ElephantAutomationClient {
  constructor({ endpoint, token, fetchImpl = globalThis.fetch } = {}) {
    this.endpoint = normalizeEndpoint(endpoint)
    this.token = String(token || '')
    this.fetch = fetchImpl
    if (!this.endpoint) throw new TypeError('ElephantAutomationClient requires an endpoint')
    if (!this.token) throw new TypeError('ElephantAutomationClient requires an automation token')
    if (typeof this.fetch !== 'function') throw new TypeError('ElephantAutomationClient requires fetch support')
  }

  async request(path, { method = 'GET', body, authenticated = true } = {}) {
    const response = await this.fetch(`${this.endpoint}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(authenticated ? { authorization: `Bearer ${this.token}` } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    const payload = await response.json().catch(() => ({ ok: false, error: `Invalid JSON response (${response.status})` }))
    if (!response.ok || payload?.ok === false) {
      const error = new Error(payload?.error || `Elephant Automation API request failed (${response.status})`)
      error.status = response.status
      error.payload = payload
      throw error
    }
    return payload
  }

  health() {
    return this.request('/v1/health', { authenticated: false })
  }

  schema() {
    return this.request('/v1/schema')
  }

  async capabilities() {
    return (await this.request('/v1/capabilities')).result
  }

  async command(command, ...args) {
    return (await this.request('/v1/command', {
      method: 'POST',
      body: { command, args }
    })).result
  }

  async batch(commands) {
    return (await this.request('/v1/batch', {
      method: 'POST',
      body: { commands }
    })).results
  }

  async logs(filter = {}) {
    const query = new URLSearchParams(Object.entries(filter)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => [key, String(value)]))
    return (await this.request(`/v1/logs${query.size ? `?${query}` : ''}`)).result
  }

  async ui(selector = 'body', options = {}) {
    const query = new URLSearchParams({ selector })
    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined && value !== null) query.set(key, String(value))
    }
    return (await this.request(`/v1/ui?${query}`)).result
  }
}

const runCli = async() => {
  const [operation = 'health', ...args] = process.argv.slice(2)
  const endpoint = process.env.ELEPHANT_AUTOMATION_ENDPOINT
  const token = process.env.ELEPHANT_AUTOMATION_TOKEN
  const client = new ElephantAutomationClient({ endpoint, token })
  let result
  if (operation === 'health') result = await client.health()
  else if (operation === 'schema') result = await client.schema()
  else if (operation === 'capabilities') result = await client.capabilities()
  else if (operation === 'command') {
    const [command, rawArgs = '[]'] = args
    const commandArgs = parseJson(rawArgs, [])
    if (!Array.isArray(commandArgs)) throw new TypeError('command arguments must be a JSON array')
    result = await client.command(command, ...commandArgs)
  } else if (operation === 'batch') {
    result = await client.batch(parseJson(args[0], []))
  } else if (operation === 'logs') {
    result = await client.logs(parseJson(args[0], {}))
  } else if (operation === 'ui') {
    result = await client.ui(args[0] || 'body', parseJson(args[1], {}))
  } else {
    throw new Error(`Unknown automation operation: ${operation}`)
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error?.stack || error)
    process.exitCode = 1
  })
}
