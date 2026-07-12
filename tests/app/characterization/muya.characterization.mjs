import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import ReferenceMuya from '@muya-reference'
import CandidateMuya from '@muya-candidate'
import { firstDifference } from './normalize.mjs'
import { runCharacterization } from './recorder.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const outputRoot = process.env.MUYA_CHARACTERIZATION_OUTPUT || path.join(repoRoot, 'build/muya-characterization')

const writeJson = (name, value) => {
  fs.mkdirSync(outputRoot, { recursive: true })
  fs.writeFileSync(path.join(outputRoot, name), `${JSON.stringify(value, null, 2)}\n`)
}

describe('Muya original-to-modular characterization parity', () => {
  it('preserves public API, Markdown, block tree, cursor, history, events and DOM', async() => {
    const reference = await runCharacterization(ReferenceMuya)
    const candidate = await runCharacterization(CandidateMuya)
    const difference = firstDifference(reference, candidate)

    writeJson('reference.json', reference)
    writeJson('candidate.json', candidate)
    writeJson('difference.json', {
      referenceRef: process.env.MUYA_REFERENCE_REF || null,
      candidateRef: process.env.MUYA_CANDIDATE_REF || null,
      equal: difference === null,
      firstDifference: difference
    })

    expect(difference).toBeNull()
  }, 120000)
})
