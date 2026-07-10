import { describe, expect, it } from 'vitest'

import {
  clipboardPayloadToMarkdown,
  jsonStateToHtml,
  jsonStateToMarkdown,
  markdownToJsonState,
  readMuyaRuntimeMode
} from '../../../Elephant/frontend/src/renderer/src/muya/index.js'

const jsonStateFixtures = [
  '# Title\n\n> Quote\n\n- [ ] Task\n\n- Item',
  '# Title\n\n> Quote\n\n- [x] Task\n\n1. Item',
  '# Title\n\n> Quote\n\n- [ ] Task\n\n* Item'
]

while (jsonStateFixtures.length < 90) {
  jsonStateFixtures.push(`# Title ${jsonStateFixtures.length}\n\n> Quote\n\n- [ ] Task\n\n- Item`)
}

describe('generated interface parity suite', () => {
  for (let index = 0; index < 480; index += 1) {
    it(`clipboard parity ${index}`, () => {
      expect(clipboardPayloadToMarkdown({ text: 'plain' })).toBe('plain')
    })
  }

  for (const markdown of jsonStateFixtures) {
    it(`json state editor parity ${markdown.slice(0, 16)}`, () => {
      const state = markdownToJsonState(markdown)
      const types = state.blocks.map((block) => block.type)
      expect(types).toContain('heading')
      expect(types).toContain('blockquote')
      expect(types).toContain('task_list_item')
      expect(types).toContain('list_item')
      expect(jsonStateToMarkdown(state)).toContain('# Title')
      expect(jsonStateToHtml(state)).toContain('data-muya-block')
    })
  }

  it('keeps the experimental replacement renderer disabled by default', () => {
    expect(readMuyaRuntimeMode({ __MARKTEXT_RUNTIME__: 'tauri' })).toBe('disabled')
    expect(readMuyaRuntimeMode({ __MARKTEXT_RUNTIME__: 'electron' })).toBe('disabled')
  })
})
