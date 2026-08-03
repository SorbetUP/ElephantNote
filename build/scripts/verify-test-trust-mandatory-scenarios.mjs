#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const manifestPath = resolve(root, 'tests/trust/required-scenarios.json')
const expectedMarkdownScenarioIds = [
  'app-starts',
  'plain-return',
  'cursor-middle-return',
  'arrow-cursor-return',
  'selection-replace',
  'multiline-insert',
  'inline-code-boundary-return',
  'list-return',
  'empty-list-exit',
  'code-boundary-return',
  'return-stress-no-crash',
  'restart-persistence'
]

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const scenarios = Array.isArray(manifest.markdownEditor) ? manifest.markdownEditor : []
const actualIds = scenarios.map((scenario) => scenario?.id)
const failures = []

if (JSON.stringify(actualIds) !== JSON.stringify(expectedMarkdownScenarioIds)) {
  const missing = expectedMarkdownScenarioIds.filter((id) => !actualIds.includes(id))
  const unexpected = actualIds.filter((id) => !expectedMarkdownScenarioIds.includes(id))
  if (missing.length > 0) failures.push(`missing mandatory scenario(s): ${missing.join(', ')}`)
  if (unexpected.length > 0) failures.push(`unexpected scenario(s): ${unexpected.join(', ')}`)
  if (missing.length === 0 && unexpected.length === 0) {
    failures.push('mandatory scenarios are not in the canonical order')
  }
}

const duplicateIds = actualIds.filter((id, index) => actualIds.indexOf(id) !== index)
if (duplicateIds.length > 0) {
  failures.push(`duplicate scenario id(s): ${[...new Set(duplicateIds)].join(', ')}`)
}

for (const scenario of scenarios) {
  if (!scenario?.id) failures.push('scenario without an id')
  if (!Array.isArray(scenario?.requires) || scenario.requires.length === 0) {
    failures.push(`scenario ${JSON.stringify(scenario?.id)} must declare non-empty proof requirements`)
  }
}

if (failures.length > 0) {
  console.error('[test-trust-mandatory-scenarios] FAILED')
  for (const failure of failures) console.error(`[test-trust-mandatory-scenarios] ${failure}`)
  process.exit(1)
}

console.log(`[test-trust-mandatory-scenarios] OK: ${actualIds.length} canonical Markdown real-app scenarios are mandatory`)
