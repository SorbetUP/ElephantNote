#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const actionRoots = [
  resolve(root, '.github/workflows'),
  resolve(root, '.github/actions')
]

const minimumMajors = new Map([
  ['checkout', 6],
  ['setup-node', 6],
  ['setup-java', 5],
  ['cache', 5],
  ['upload-artifact', 7],
  ['download-artifact', 8]
])

const trackedActionPattern = /uses:\s*actions\/([a-z0-9-]+)@([^\s#]+)/gi

export const inspectWorkflowSource = (source, filename = '<memory>') => {
  const errors = []
  let match

  while ((match = trackedActionPattern.exec(String(source || ''))) !== null) {
    const [, action, rawRef] = match
    const minimumMajor = minimumMajors.get(action)
    if (!minimumMajor) continue

    const majorMatch = rawRef.match(/^v(\d+)(?:\.\d+(?:\.\d+)?)?$/)
    if (!majorMatch) {
      errors.push(
        `${filename}: actions/${action}@${rawRef} cannot be proven to use the required Node 24 action line; use v${minimumMajor} or newer`
      )
      continue
    }

    const actualMajor = Number(majorMatch[1])
    if (actualMajor < minimumMajor) {
      errors.push(
        `${filename}: actions/${action}@v${actualMajor} is obsolete; use v${minimumMajor} or newer`
      )
    }
  }

  return errors
}

const listActionFiles = (directory) => {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const absolute = resolve(directory, entry.name)
      if (entry.isDirectory()) return listActionFiles(absolute)
      return ['.yml', '.yaml'].includes(extname(entry.name).toLowerCase()) ? [absolute] : []
    })
    .sort()
}

const assertGuardSensitivity = () => {
  const valid = `
steps:
  - uses: actions/checkout@v6
  - uses: actions/setup-node@v6
  - uses: actions/setup-java@v5
  - uses: actions/cache@v5
  - uses: actions/upload-artifact@v7
  - uses: actions/download-artifact@v8
`
  const invalid = `
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
  - uses: actions/setup-java@v4
  - uses: actions/cache@v4
  - uses: actions/upload-artifact@v4
  - uses: actions/download-artifact@v4
`

  if (inspectWorkflowSource(valid, 'valid.yml').length !== 0) {
    throw new Error('Node 24 Actions guard self-test rejected valid action majors')
  }

  const invalidErrors = inspectWorkflowSource(invalid, 'invalid.yml')
  if (invalidErrors.length !== minimumMajors.size) {
    throw new Error(
      `Node 24 Actions guard self-test expected ${minimumMajors.size} failures, got ${invalidErrors.length}`
    )
  }
}

assertGuardSensitivity()

const actionFiles = actionRoots.flatMap(listActionFiles).sort()
const errors = actionFiles.flatMap((absolute) => {
  const relative = absolute.slice(root.length + 1)
  return inspectWorkflowSource(readFileSync(absolute, 'utf8'), relative)
})

if (errors.length > 0) {
  console.error('[actions-node24] workflow/composite runtime guard failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(
  `[actions-node24] verified ${actionFiles.length} workflow/composite action file(s): tracked official actions use Node 24-compatible major lines`
)
