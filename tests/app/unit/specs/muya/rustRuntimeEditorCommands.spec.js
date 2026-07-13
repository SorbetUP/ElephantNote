import { describe, expect, it } from 'vitest'

import {
  rustBusCommand,
  rustParagraphCommand
} from '../../../../../Elephant/frontend/src/renderer/src/components/editorWithTabs/runtimeEditorCommands'

describe('Elephant Rust editor command routing', () => {
  it.each([
    ['blockquote', { type: 'toggle_block_quote' }],
    ['pre', { type: 'toggle_code_block' }],
    ['ul-bullet', { type: 'set_list_kind', kind: 'unordered' }],
    ['ul-task', { type: 'set_list_kind', kind: 'task' }],
    ['ol-order', { type: 'set_list_kind', kind: 'ordered' }]
  ])('routes paragraph menu %s to Rust', (type, command) => {
    expect(rustParagraphCommand(type)).toEqual(command)
    expect(rustBusCommand('paragraph', type)).toEqual(command)
  })

  it('keeps paragraph, heading and horizontal rule commands on Rust', () => {
    expect(rustParagraphCommand('paragraph')).toEqual({ type: 'set_paragraph' })
    expect(rustParagraphCommand('heading 4')).toEqual({
      type: 'set_heading',
      level: 4
    })
    expect(rustBusCommand('insert-horizontal-rule')).toEqual({
      type: 'insert_horizontal_rule'
    })
  })

  it('does not invent a fallback for unsupported menu entries', () => {
    expect(rustParagraphCommand('table')).toBeNull()
    expect(rustBusCommand('unknown')).toBeNull()
  })
})
