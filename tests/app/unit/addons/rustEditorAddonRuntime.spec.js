import { describe, expect, it, vi } from 'vitest'

import { createRustEditorRuntimeBinding } from '../../../../Elephant/frontend/src/renderer/src/muya/editorRuntimeResource'

const createBinding = (container) => {
  const bridge = {
    revision: 3,
    selection: { anchor: 0, focus: 0 },
    snapshot: vi.fn(() => ({ revision: 3 })),
    dispatch: vi.fn()
  }
  return createRustEditorRuntimeBinding({
    runtime: { bridge, domContainer: container },
    getMarkdown: () => '```python\nprint(1)\n```'
  })
}

describe('Rust editor addon runtime', () => {
  it('publishes canonical Rust DOM blocks', () => {
    const container = document.createElement('section')
    const code = document.createElement('pre')
    code.dataset.elephantEditorNode = '7'
    code.dataset.elephantEditorLayer = 'block'
    code.dataset.elephantEditorKind = 'code_block'
    code.dataset.language = 'python'
    container.append(code)

    const binding = createBinding(container)

    expect(binding.resource.queryBlocks({ kind: 'code_block' })[0]).toMatchObject({
      nodeId: 7,
      kind: 'code_block',
      language: 'python',
      element: code
    })
    binding.dispose()
  })

  it('normalizes the production Muya code block DOM behind the neutral runtime API', () => {
    const container = document.createElement('section')
    const code = document.createElement('pre')
    code.id = 'ag-42'
    code.className = 'ag-paragraph ag-fence-code'
    code.dataset.lang = 'python'
    container.append(code)

    const binding = createBinding(container)
    const blocks = binding.resource.queryBlocks({ kind: 'code_block' })

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({
      nodeId: 42,
      kind: 'code_block',
      language: 'python',
      element: code
    })
    expect(code.dataset.elephantEditorLayer).toBe('block')
    expect(code.dataset.elephantEditorKind).toBe('code_block')
    expect(code.dataset.elephantEditorNode).toBe('42')
    expect(code.dataset.language).toBe('python')
    binding.dispose()
  })

  it('notifies addons when a production code block is mounted after runtime publication', async() => {
    const container = document.createElement('section')
    const binding = createBinding(container)
    const listener = vi.fn()
    binding.resource.watch(listener, { immediate: false })

    const code = document.createElement('pre')
    code.className = 'ag-paragraph ag-fence-code'
    code.dataset.lang = 'javascript'
    container.append(code)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ reason: 'dom-change' }))
    expect(binding.resource.queryBlocks({ kind: 'code_block', language: 'javascript' })).toHaveLength(1)
    binding.dispose()
  })
})
