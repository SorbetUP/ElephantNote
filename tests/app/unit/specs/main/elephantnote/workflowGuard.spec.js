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
    expect(workflow.slice(checkIndex, testIndex)).toContain('cargo check --manifest-path Elephant/backend/tauri/Cargo.toml --all-targets --no-default-features')
  })

  it('keeps main CI Rust formatting, compile and tests blocking in order', () => {
    const workflow = read('.github/workflows/ci.yml')
    const fmtIndex = workflow.indexOf('- name: Rust formatting')
    const checkIndex = workflow.indexOf('- name: Rust check')
    const testIndex = workflow.indexOf('- name: Rust tests')

    expect(fmtIndex).toBeGreaterThan(-1)
    expect(checkIndex).toBeGreaterThan(fmtIndex)
    expect(testIndex).toBeGreaterThan(checkIndex)
    expect(workflow.slice(fmtIndex, testIndex)).not.toContain('continue-on-error: true')
    expect(workflow.slice(fmtIndex, checkIndex)).toContain('cargo fmt --manifest-path Elephant/backend/tauri/Cargo.toml -- --check')
    expect(workflow.slice(checkIndex, testIndex)).toContain('cargo check --manifest-path Elephant/backend/tauri/Cargo.toml --all-targets --no-default-features')
  })

  it('keeps dedicated Tauri formatting diagnostic while compile and tests remain blocking', () => {
    const workflow = read('.github/workflows/tauri-ci.yml')
    const fmtIndex = workflow.indexOf('- name: Rust formatting diagnostic')
    const checkIndex = workflow.indexOf('- name: Cargo check all targets')
    const testIndex = workflow.indexOf('- name: Cargo tests')

    expect(fmtIndex).toBeGreaterThan(-1)
    expect(checkIndex).toBeGreaterThan(fmtIndex)
    expect(testIndex).toBeGreaterThan(checkIndex)
    expect(workflow.slice(fmtIndex, checkIndex)).toContain('continue-on-error: true')
    expect(workflow.slice(checkIndex, testIndex)).not.toContain('continue-on-error: true')
    expect(workflow.slice(checkIndex, testIndex)).toContain('cargo check --manifest-path Elephant/backend/tauri/Cargo.toml --all-targets --no-default-features')
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
