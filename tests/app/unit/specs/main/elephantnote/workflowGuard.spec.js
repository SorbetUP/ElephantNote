import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const assertBlockingRustOrder = ({ workflow, formattingName, formattingMayBeDiagnostic }) => {
  const fmtIndex = workflow.indexOf(`- name: ${formattingName}`)
  const checkIndex = workflow.indexOf('cargo check --manifest-path Elephant/backend/tauri/Cargo.toml --all-targets --no-default-features')
  const testIndex = workflow.indexOf('cargo test --manifest-path Elephant/backend/tauri/Cargo.toml --lib --no-default-features')

  expect(fmtIndex).toBeGreaterThan(-1)
  expect(checkIndex).toBeGreaterThan(fmtIndex)
  expect(testIndex).toBeGreaterThan(checkIndex)
  if (formattingMayBeDiagnostic) {
    expect(workflow.slice(fmtIndex, checkIndex)).toContain('continue-on-error: true')
  } else {
    expect(workflow.slice(fmtIndex, checkIndex)).not.toContain('continue-on-error: true')
  }
  expect(workflow.slice(checkIndex, testIndex)).not.toContain('continue-on-error: true')
}

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

  it('keeps formatting, compile and tests ordered without hiding compile failures', () => {
    const mainCi = read('.github/workflows/ci.yml')
    const dedicatedCi = read('.github/workflows/tauri-ci.yml')

    assertBlockingRustOrder({
      workflow: mainCi,
      formattingName: 'Rust formatting',
      formattingMayBeDiagnostic: false
    })
    expect(mainCi.indexOf('Prepare embedded Tauri addon resources for Rust checks')).toBeLessThan(
      mainCi.indexOf('- name: Rust formatting')
    )

    assertBlockingRustOrder({
      workflow: dedicatedCi,
      formattingName: 'Rust formatting diagnostic',
      formattingMayBeDiagnostic: true
    })
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
