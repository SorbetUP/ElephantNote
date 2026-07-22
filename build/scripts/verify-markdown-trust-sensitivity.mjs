#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '../..')
const runner = resolve(root, 'build/scripts/run-markdown-editor-trust.mjs')
const mutationModule = pathToFileURL(resolve(root, 'build/scripts/markdown-trust-fetch-mutation.mjs')).href
const artifact = resolve(root, 'test-results/trusted/markdown-editor/latest.json')
const existingNodeOptions = String(process.env.NODE_OPTIONS || '').trim()
const nodeOptions = [existingNodeOptions, `--import=${mutationModule}`].filter(Boolean).join(' ')

const cases = [
  {
    mutation: 'ignore-enter',
    scenarioId: 'plain-return',
    outputMarker: '[markdown-trust-mutation] swallowed real Enter command',
    passLabel: 'swallowing Enter makes plain-return red'
  },
  {
    mutation: 'ignore-save',
    scenarioId: 'plain-return',
    outputMarker: '[markdown-trust-mutation] swallowed real save command',
    passLabel: 'swallowing save makes plain-return red'
  }
]

for (const specification of cases) {
  console.log(`[markdown-trust-sensitivity] expecting the real suite to fail for ${specification.mutation}`)
  const result = spawnSync(process.execPath, [runner], {
    cwd: root,
    env: {
      ...process.env,
      NODE_OPTIONS: nodeOptions,
      ELEPHANT_TRUST_MUTATION: specification.mutation
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })

  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)

  if (result.status === 0) {
    throw new Error(`Markdown trust suite remained green under mutation ${specification.mutation}`)
  }

  const payload = JSON.parse(readFileSync(artifact, 'utf8'))
  const scenario = (payload.scenarios || []).find((entry) => entry.id === specification.scenarioId)
  if (payload.status !== 'NOT PROVEN') {
    throw new Error(`Mutated suite did not report NOT PROVEN for ${specification.mutation}: ${JSON.stringify(payload)}`)
  }
  if (!scenario || scenario.ok !== false) {
    throw new Error(`Mutation ${specification.mutation} did not fail ${specification.scenarioId}: ${JSON.stringify(payload.scenarios)}`)
  }
  if (!(result.stderr || '').includes(specification.outputMarker)) {
    throw new Error(`Mutation ${specification.mutation} was not observed in runner stderr`)
  }

  console.log(`[markdown-trust-sensitivity] PASS: ${specification.passLabel}`)
}

console.log('[markdown-trust-sensitivity] PASS: all deliberate mutations made the real suite red')
