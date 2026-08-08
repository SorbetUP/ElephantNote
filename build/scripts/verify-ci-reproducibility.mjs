#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const setupPath = '.github/actions/setup/action.yml'

export const inspectSetupSource = (source, filename = '<memory>') => {
  const text = String(source || '')
  const errors = []

  if (!text.includes('pnpm install --frozen-lockfile --ignore-scripts')) {
    errors.push(`${filename}: dependency installation must require the committed pnpm lockfile`)
  }
  if (text.includes('--no-frozen-lockfile')) {
    errors.push(`${filename}: CI must not fall back to an unlocked dependency graph`)
  }
  if (/pnpm install[^\n]*\|\||\|\|\s*\{[\s\S]*pnpm install/.test(text)) {
    errors.push(`${filename}: dependency installation failure must not be hidden by a fallback install`)
  }
  if (!text.includes('git diff --exit-code -- package.json pnpm-lock.yaml')) {
    errors.push(`${filename}: setup must prove that dependency installation did not rewrite dependency inputs`)
  }

  return errors
}

const assertSensitivity = () => {
  const valid = `
pnpm install --frozen-lockfile --ignore-scripts
git diff --exit-code -- package.json pnpm-lock.yaml
`
  const invalid = `
pnpm install --frozen-lockfile --ignore-scripts || {
  pnpm install --no-frozen-lockfile --ignore-scripts
}
`

  if (inspectSetupSource(valid, 'valid.yml').length !== 0) {
    throw new Error('CI reproducibility guard self-test rejected the deterministic fixture')
  }

  const invalidErrors = inspectSetupSource(invalid, 'invalid.yml')
  if (invalidErrors.length !== 3) {
    throw new Error(`CI reproducibility guard self-test expected 3 failures, got ${invalidErrors.length}`)
  }
}

assertSensitivity()

const source = readFileSync(resolve(root, setupPath), 'utf8')
const errors = inspectSetupSource(source, setupPath)

if (errors.length > 0) {
  console.error('[ci-reproducibility] deterministic setup guard failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log('[ci-reproducibility] dependency setup is frozen and fail-closed')
