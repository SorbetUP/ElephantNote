import { describe, expect, it } from 'vitest'

import { createQuickInsertObj as createReference } from '@muya-reference-quick-insert'
import { createQuickInsertObj as createCandidate } from '@muya-candidate-quick-insert'

const translations = new Proxy({}, {
  get: (_target, property) => `translated:${String(property)}`
})

const translate = (key) => translations[key]

const normalize = (value) => JSON.parse(
  JSON.stringify(value)
    .replace(/(?:file:\/\/)?[^"']*\/Elephant\/frontend\/src\/(?:\.muya-characterization-reference|muya)\//g, '/MUYA_SOURCE/')
)

describe('Muya quick insert characterization parity', () => {
  it('preserves categories, commands, labels, shortcuts, translations and icons', () => {
    const reference = normalize(createReference(translate))
    const candidate = normalize(createCandidate(translate))

    expect(candidate).toEqual(reference)
  })

  it('preserves fallback translation behavior', () => {
    expect(normalize(createCandidate())).toEqual(normalize(createReference()))
  })
})
