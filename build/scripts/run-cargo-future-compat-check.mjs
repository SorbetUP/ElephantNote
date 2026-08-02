#!/usr/bin/env node

import { spawn } from 'node:child_process'

const futureIncompatPatterns = [
  /the following packages contain code that will be rejected by a future\s+version of Rust/i,
  /future-incompatible warnings? (?:were|was) (?:found|reported)/i
]
const ansiPattern = /\u001B\[[0-?]*[ -/]*[@-~]/g
const normalizeOutput = (output) => String(output || '').replace(ansiPattern, '')

export const containsFutureIncompatibility = (output) => {
  const normalized = normalizeOutput(output)
  return futureIncompatPatterns.some((pattern) => pattern.test(normalized))
}

const assertSensitivity = () => {
  const clean = 'Finished `dev` profile [unoptimized + debuginfo] target(s) in 1.23s'
  const dirty = `warning: the following packages contain code that will be rejected by a future
version of Rust: multipart v0.18.0`
  const coloredDirty = `\u001b[1;33mwarning\u001b[0m: the following packages contain code that will be rejected by a future
version of Rust: buf_redux v0.8.4`

  if (containsFutureIncompatibility(clean)) {
    throw new Error('Cargo future-compat guard self-test rejected clean output')
  }
  if (!containsFutureIncompatibility(dirty) || !containsFutureIncompatibility(coloredDirty)) {
    throw new Error('Cargo future-compat guard self-test missed a future-incompatible dependency')
  }
}

assertSensitivity()

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Usage: node build/scripts/run-cargo-future-compat-check.mjs <cargo check args...>')
  process.exit(2)
}

const cargoArgs = ['check', '--future-incompat-report', ...args]
console.log(`[cargo-future-compat] cargo ${cargoArgs.join(' ')}`)

const child = spawn('cargo', cargoArgs, {
  env: process.env,
  stdio: ['inherit', 'pipe', 'pipe']
})

let output = ''
const relay = (stream, target) => {
  stream.on('data', (chunk) => {
    const text = chunk.toString()
    output += text
    target.write(text)
  })
}
relay(child.stdout, process.stdout)
relay(child.stderr, process.stderr)

child.on('error', (error) => {
  console.error(`[cargo-future-compat] failed to start Cargo: ${error.message}`)
  process.exit(1)
})

child.on('close', (status, signal) => {
  if (signal) {
    console.error(`[cargo-future-compat] Cargo terminated by ${signal}`)
    process.exit(1)
  }
  if (status !== 0) process.exit(status ?? 1)
  if (containsFutureIncompatibility(output)) {
    console.error('[cargo-future-compat] future-incompatible Rust dependencies detected')
    process.exit(1)
  }
  console.log('[cargo-future-compat] no future-incompatible Rust dependency reported')
})
