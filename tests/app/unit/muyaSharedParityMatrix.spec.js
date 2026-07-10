import { describe, expect, it } from 'vitest'

import parityCases from '../../../Elephant/shared/muyaParityCases.json'
import { applyKeyboardRuleToMarkdown } from '../../../Elephant/frontend/src/renderer/src/muya/inputRulesRuntime.js'
import { applyOperation } from '../../../Elephant/frontend/src/renderer/src/muya/operationsRuntime.js'
import { slashCommands, upsertFootnote } from '../../../Elephant/frontend/src/renderer/src/muya/menusPreviewRuntime.js'
import { resizeImageMarkdown, tableCommand } from '../../../Elephant/frontend/src/renderer/src/muya/tableImageRuntime.js'

const applyLegacyCommand = (testCase) => {
  const { markdown, command, selection } = testCase
  if (command.type === 'applyOperation') return applyOperation(markdown, command.operation)
  if (command.type === 'keyboardRule') {
    return applyKeyboardRuleToMarkdown(markdown, command.key, { shiftKey: command.shiftKey })
  }
  if (command.type === 'tableCommand') return tableCommand(markdown, command.action, command.index)
  if (command.type === 'resizeImage') return resizeImageMarkdown(markdown, command.cursor, command.width)
  if (command.type === 'upsertFootnote') return upsertFootnote(markdown, command.label, command.text)
  if (command.type === 'insertTemplate') {
    const template = slashCommands('').find((item) => item.id === command.id)?.markdown
    if (typeof template !== 'string') throw new Error(`unknown template: ${command.id}`)
    const start = Math.min(selection.anchor, selection.focus)
    const end = Math.max(selection.anchor, selection.focus)
    return `${markdown.slice(0, start)}${template}${markdown.slice(end)}`
  }
  throw new Error(`unsupported parity command: ${command.type}`)
}

describe('shared Muya JavaScript/Rust parity matrix', () => {
  it('contains a broad mutation matrix', () => {
    expect(parityCases.length).toBeGreaterThanOrEqual(12)
    expect(new Set(parityCases.map((item) => item.command.type))).toEqual(new Set([
      'applyOperation',
      'keyboardRule',
      'tableCommand',
      'resizeImage',
      'upsertFootnote',
      'insertTemplate'
    ]))
  })

  for (const testCase of parityCases) {
    it(testCase.name, () => {
      expect(applyLegacyCommand(testCase)).toBe(testCase.expected)
    })
  }
})
