import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  dependencyFingerprint,
  inspectDependencyState,
  markDependenciesCurrent,
  missingRuntimeModules
} from '../../../../../../build/scripts/ensure-dev-dependencies.mjs'

const temporaryRoots = []

const createFixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'elephantnote-dev-deps-'))
  temporaryRoots.push(root)
  mkdirSync(join(root, 'Elephant/node_modules/.bin'), { recursive: true })
  mkdirSync(join(root, 'Elephant/frontend/app/services'), { recursive: true })
  writeFileSync(join(root, 'package.json'), '{"name":"fixture","dependencies":{}}\n')
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n')
  writeFileSync(join(root, '.npmrc'), 'modules-dir=Elephant/node_modules\n')
  writeFileSync(join(root, 'Elephant/node_modules/.bin/vite'), '')
  return root
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('Tauri development dependency guard', () => {
  it('marks a verified dependency installation as current', () => {
    const root = createFixture()

    expect(inspectDependencyState(root, []).needsInstall).toBe(true)
    markDependenciesCurrent(root)

    const state = inspectDependencyState(root, [])
    expect(state.needsInstall).toBe(false)
    expect(state.markerMatches).toBe(true)
    expect(state.viteInstalled).toBe(true)
  })

  it('detects a lockfile or package metadata change after switching branches', () => {
    const root = createFixture()
    const initialFingerprint = dependencyFingerprint(root)
    markDependenciesCurrent(root, initialFingerprint)

    writeFileSync(join(root, 'package.json'), '{"name":"fixture","dependencies":{"qrcode":"^1.5.4"}}\n')

    const state = inspectDependencyState(root, [])
    expect(state.fingerprint).not.toBe(initialFingerprint)
    expect(state.markerMatches).toBe(false)
    expect(state.needsInstall).toBe(true)
  })

  it('resolves the QR generator and scanner from the installed project modules', () => {
    const root = process.cwd()
    expect(missingRuntimeModules(root, ['qrcode', '@zxing/browser'])).toEqual([])
  })

  it('runs the dependency guard before Vite and Tauri are started', () => {
    const source = readFileSync(join(process.cwd(), 'build/scripts/build_dev.sh'), 'utf8')
    const guardIndex = source.indexOf('ensure-dev-dependencies.mjs')
    const llamaIndex = source.indexOf('ensure-tauri-llama-server.mjs')
    const tauriIndex = source.indexOf('cargo tauri dev')

    expect(guardIndex).toBeGreaterThan(-1)
    expect(guardIndex).toBeLessThan(llamaIndex)
    expect(llamaIndex).toBeLessThan(tauriIndex)
  })
})
