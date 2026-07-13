import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const source = fs.readFileSync(path.join(process.cwd(), 'Elephant/frontend/app/components/settings/AiProviderSettingsPanel.vue'), 'utf8')

describe('local embedding model picker', () => {
  test('lists downloaded embedding-capable models instead of requiring a raw id', () => {
    expect(source).toContain('v-for="model in localEmbeddingModels"')
    expect(source).toContain('elephantnoteClient.models.listLocal?.()')
    expect(source).toContain('elephantnoteClient.models.getSelection?.()')
    expect(source).toContain('getModelCapabilities')
    expect(source).toContain('Select a downloaded embedding model')
    expect(source).not.toContain('localEmbeddingModelHint')
  })

  test('keeps manual model ids for external providers', () => {
    expect(source).toMatch(/v-else[\s\S]*v-model\.trim="form\.routes\.embedding\.model"/)
  })
})
