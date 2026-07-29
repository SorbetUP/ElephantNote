#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const lockPath = join(root, 'Elephant/crates/muya-wasm/Cargo.lock')
const requiredBinaries = ['wasm-bindgen', 'wasm-bindgen-test-runner', 'wasm2es6js']

const hasWasmTarget = () => {
  try {
    const installed = execFileSync('rustup', ['target', 'list', '--installed'], { encoding: 'utf8' })
    return installed.split(/\r?\n/).includes('wasm32-unknown-unknown')
  } catch {
    return false
  }
}

const readLockedVersion = () => {
  const lock = readFileSync(lockPath, 'utf8')
  for (const block of lock.split('[[package]]')) {
    if (!/^\s*name\s*=\s*"wasm-bindgen"\s*$/m.test(block)) continue
    const version = block.match(/^\s*version\s*=\s*"([^"]+)"\s*$/m)?.[1]
    if (version) return version
  }
  throw new Error(`Unable to resolve the locked wasm-bindgen version from ${lockPath}`)
}

const releaseTarget = () => {
  const key = `${process.platform}:${process.arch}`
  const targets = {
    'linux:x64': 'x86_64-unknown-linux-musl',
    'linux:arm64': 'aarch64-unknown-linux-musl',
    'darwin:x64': 'x86_64-apple-darwin',
    'darwin:arm64': 'aarch64-apple-darwin',
    'win32:x64': 'x86_64-pc-windows-msvc'
  }
  const target = targets[key]
  if (!target) throw new Error(`No official wasm-bindgen CLI archive is configured for ${key}`)
  return target
}

const executableName = (name) => process.platform === 'win32' ? `${name}.exe` : name
const cargoBin = join(process.env.CARGO_HOME || join(homedir(), '.cargo'), 'bin')

const installedVersion = () => {
  const executable = join(cargoBin, executableName('wasm-bindgen'))
  if (!existsSync(executable)) return null
  try {
    const output = execFileSync(executable, ['--version'], { encoding: 'utf8' }).trim()
    return output.match(/\b(\d+\.\d+\.\d+)\b/)?.[1] || null
  } catch {
    return null
  }
}

const download = async(url) => {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/octet-stream',
      'User-Agent': 'Elephant-CI-wasm-bindgen-installer'
    },
    redirect: 'follow'
  })
  if (!response.ok) throw new Error(`Download failed (${response.status}) for ${url}`)
  return Buffer.from(await response.arrayBuffer())
}

const findBinary = (rootDirectory, expectedName) => {
  const output = execFileSync(
    process.execPath,
    ['-e', `
      const fs = require('fs')
      const path = require('path')
      const [root, expected] = process.argv.slice(1)
      const stack = [root]
      while (stack.length) {
        const current = stack.pop()
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
          const candidate = path.join(current, entry.name)
          if (entry.isDirectory()) stack.push(candidate)
          else if (entry.name === expected) {
            process.stdout.write(candidate)
            process.exit(0)
          }
        }
      }
      process.exit(1)
    `, rootDirectory, expectedName],
    { encoding: 'utf8' }
  ).trim()
  if (!output) throw new Error(`Archive did not contain ${expectedName}`)
  return output
}

const appendPath = () => {
  if (!process.env.GITHUB_PATH) return
  writeFileSync(process.env.GITHUB_PATH, `${cargoBin}\n`, { flag: 'a' })
}

const main = async() => {
  if (!hasWasmTarget()) {
    console.log('[wasm-bindgen-cli] wasm32-unknown-unknown target is not installed; skipping CLI setup for this job')
    return
  }

  const version = readLockedVersion()
  const current = installedVersion()
  mkdirSync(cargoBin, { recursive: true })
  appendPath()

  if (current === version) {
    console.log(`[wasm-bindgen-cli] exact prebuilt version already installed: ${version}`)
    return
  }

  const target = releaseTarget()
  const archiveName = `wasm-bindgen-${version}-${target}.tar.gz`
  const releaseBase = `https://github.com/wasm-bindgen/wasm-bindgen/releases/download/${version}`
  const archiveUrl = `${releaseBase}/${archiveName}`
  const checksumUrl = `${archiveUrl}.sha256sum`
  const workDirectory = mkdtempSync(join(tmpdir(), 'elephant-wasm-bindgen-'))

  try {
    console.log(`[wasm-bindgen-cli] installing official prebuilt archive ${archiveName}`)
    const [archive, checksumFile] = await Promise.all([
      download(archiveUrl),
      download(checksumUrl)
    ])
    const expected = checksumFile.toString('utf8').trim().split(/\s+/)[0]?.toLowerCase()
    const actual = createHash('sha256').update(archive).digest('hex')
    if (!expected || !/^[a-f0-9]{64}$/.test(expected)) {
      throw new Error(`Invalid SHA-256 file returned by ${checksumUrl}`)
    }
    if (actual !== expected) {
      throw new Error(`SHA-256 mismatch for ${archiveName}: expected ${expected}, got ${actual}`)
    }

    const archivePath = join(workDirectory, archiveName)
    const extractDirectory = join(workDirectory, 'extract')
    mkdirSync(extractDirectory)
    writeFileSync(archivePath, archive)
    execFileSync('tar', ['-xzf', archivePath, '-C', extractDirectory], { stdio: 'inherit' })

    for (const binary of requiredBinaries) {
      const expectedName = executableName(binary)
      const source = findBinary(extractDirectory, expectedName)
      const destination = join(cargoBin, expectedName)
      copyFileSync(source, destination)
      if (process.platform !== 'win32') chmodSync(destination, 0o755)
      console.log(`[wasm-bindgen-cli] installed ${basename(destination)}`)
    }

    const verified = installedVersion()
    if (verified !== version) {
      throw new Error(`Installed wasm-bindgen version mismatch: expected ${version}, got ${verified || 'missing'}`)
    }
    console.log(`[wasm-bindgen-cli] verified official prebuilt version ${verified}`)
  } finally {
    rmSync(workDirectory, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(`[wasm-bindgen-cli] ${error?.stack || error}`)
  process.exit(1)
})
