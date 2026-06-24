import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

describe('CI workflow guards', () => {
  it('keeps the dedicated Tauri cargo check blocking', () => {
    const workflow = read('.github/workflows/tauri-ci.yml')
    const checkIndex = workflow.indexOf('- name: Cargo check all targets')
    const testIndex = workflow.indexOf('- name: Cargo tests')

    expect(checkIndex).toBeGreaterThan(-1)
    expect(testIndex).toBeGreaterThan(checkIndex)
    expect(workflow.slice(checkIndex, testIndex)).not.toContain('continue-on-error: true')
    expect(workflow.slice(checkIndex, testIndex)).toContain('cargo check --manifest-path src-tauri/Cargo.toml --all-targets --no-default-features')
  })

  it('keeps dependency setup resilient to stale pnpm lockfiles', () => {
    const setup = read('.github/actions/setup/action.yml')

    expect(setup).toContain('pnpm install --frozen-lockfile --ignore-scripts || {')
    expect(setup).toContain('pnpm install --no-frozen-lockfile --ignore-scripts')
    expect(setup.indexOf('pnpm install --frozen-lockfile --ignore-scripts')).toBeLessThan(
      setup.indexOf('pnpm install --no-frozen-lockfile --ignore-scripts')
    )
  })
})
