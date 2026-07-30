// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createRustEditorRuntimeBinding } from '../../../../Elephant/frontend/src/renderer/src/muya/editorRuntimeResource'

const settleMutations = async() => {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const semanticCodeBlock = () => {
  const block = document.createElement('pre')
  block.dataset.elephantEditorNode = '7'
  block.dataset.elephantEditorLayer = 'block'
  block.dataset.elephantEditorKind = 'code_block'
  block.dataset.language = 'python'
  return block
}

const runtime = (root) => ({
  bridge: {
    revision: 3,
    selection: null,
    snapshot: vi.fn(() => ({ revision: 3 })),
    dispatch: vi.fn()
  },
  domContainer: root
})

afterEach(() => {
  document.body.replaceChildren()
})

describe('Rust editor runtime semantic DOM watch', () => {
  it('notifies addons when semantic blocks render after the runtime is published', async() => {
    const root = document.createElement('section')
    document.body.append(root)
    const binding = createRustEditorRuntimeBinding({
      runtime: runtime(root),
      getMarkdown: () => '```python\nprint(1)\n```'
    })
    const listener = vi.fn()
    binding.resource.watch(listener, { immediate: false })

    const block = semanticCodeBlock()
    root.append(block)
    await settleMutations()

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({
      engine: 'rust',
      reason: 'dom-change'
    }))
    expect(binding.resource.queryBlocks({ kind: 'code_block' })).toEqual([
      expect.objectContaining({ nodeId: 7, kind: 'code_block', language: 'python', element: block })
    ])

    const addonToolbar = document.createElement('div')
    addonToolbar.className = 'elephant-physical-code-toolbar'
    block.append(addonToolbar)
    await settleMutations()
    expect(listener).toHaveBeenCalledTimes(1)

    block.remove()
    await settleMutations()
    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ reason: 'dom-change' }))

    binding.dispose()
    root.append(semanticCodeBlock())
    await settleMutations()
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
