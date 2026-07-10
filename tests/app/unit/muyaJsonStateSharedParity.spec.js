import { describe, expect, it } from 'vitest'

import cases from '../../../Elephant/shared/muyaJsonStateCases.json'
import {
  jsonStateToMarkdown,
  markdownToJsonState
} from '../../../Elephant/frontend/src/renderer/src/muya/jsonStateRuntime.js'

describe('shared Muya JSON state parity', () => {
  it('keeps a broad structural matrix', () => {
    expect(cases.length).toBeGreaterThanOrEqual(8)
  })

  for (const testCase of cases) {
    it(testCase.name, () => {
      const state = markdownToJsonState(testCase.markdown)
      expect(state).toEqual(testCase.expected)
      expect(jsonStateToMarkdown(state)).toBe(testCase.roundTrip)
    })
  }
})
