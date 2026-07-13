import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import selection from '../../../../../Elephant/frontend/src/muya/lib/selection'
import ExportMarkdown from '../../../../../Elephant/frontend/src/muya/lib/utils/exportMarkdown'
import {
  bundled,
  fakeKeyEvent,
  initializeRustWasm,
  runDifferentialTrace,
  setJsSelectionByText
} from './rustDifferentialHarness'

const describeJsTree = (muya) => {
  const serialize = (block) => ({
    key: block.key,
    type: block.type,
    functionType: block.functionType,
    listType: block.listType,
    text: block.text,
    parent: block.parent,
    preSibling: block.preSibling,
    nextSibling: block.nextSibling,
    children: (block.children || []).map(serialize)
  })
  const blocks = muya.contentState.getBlocks()
  const { listIndentation, isGitlabCompatibilityEnabled } = muya.contentState
  return {
    tree: blocks.map(serialize),
    signatures: blocks.map((block) => ({
      key: block.key,
      signature: muya.getMarkdownBlockSignature(block)
    })),
    directMarkdown: new ExportMarkdown(
      blocks,
      listIndentation,
      isGitlabCompatibilityEnabled
    ).generate(),
    incrementalMarkdown: muya.getMarkdown()
  }
}

const describeJsCursor = (muya, label) => {
  const { contentState } = muya
  const selectedBlock = contentState.getBlock(contentState.cursor.start.key)
  let block = selectedBlock
  const path = []
  while (block) {
    path.push({
      key: block.key,
      type: block.type,
      functionType: block.functionType,
      listType: block.listType,
      text: block.text,
      parent: block.parent,
      preSibling: block.preSibling,
      nextSibling: block.nextSibling,
      children: block.children?.length ?? 0
    })
    block = block.parent ? contentState.getBlock(block.parent) : null
  }
  return {
    label,
    cursor: contentState.cursor,
    domCursor: selection.getCursorRange(),
    indentable: contentState.isIndentableListItem(),
    unindentable: contentState.isUnindentableListItem(selectedBlock),
    atFormatEnd: contentState.checkCursorAtEndFormat(
      selectedBlock.text,
      contentState.cursor.start.offset
    ),
    path
  }
}

const runDiagnosedTab = (muya, label, event) => {
  const { contentState } = muya
  const calls = []
  const originals = {
    indentListItem: contentState.indentListItem,
    unindentListItem: contentState.unindentListItem,
    insertTab: contentState.insertTab
  }

  for (const method of Object.keys(originals)) {
    contentState[method] = function(...args) {
      calls.push({ method, phase: 'before', document: describeJsTree(muya) })
      const result = originals[method].apply(this, args)
      calls.push({ method, phase: 'after', document: describeJsTree(muya) })
      return result
    }
  }

  const before = describeJsCursor(muya, label)
  const result = contentState.tabHandler(event)
  const after = {
    document: describeJsTree(muya),
    cursor: contentState.cursor,
    domCursor: selection.getCursorRange(),
    returnType: result?.constructor?.name ?? typeof result,
    calls
  }
  console.log('[muya-list-handler]', JSON.stringify({ before, after }))

  Object.assign(contentState, originals)
  return result
}

const describeBundled = bundled ? describe : describe.skip
const traces = [
  {
    name: 'indent a flat unordered item under its previous sibling',
    initial: '- parent\n- child',
    expected: '- parent\n  - child\n',
    runJs: async (muya) => {
      setJsSelectionByText(muya, 'child', 0)
      muya.contentState.tabHandler(fakeKeyEvent())
    },
    runRust: (rust) => {
      rust.setSelectionByText('child', 0)
      rust.request({ type: 'indent_list_item' })
    }
  },
  {
    name: 'reuse an existing nested unordered list when indenting',
    initial: '- parent\n  - first\n- second',
    expected: '- parent\n  - first\n  - second\n',
    runJs: async (muya) => {
      setJsSelectionByText(muya, 'second', 0)
      runDiagnosedTab(muya, 'indent-second', fakeKeyEvent())
    },
    runRust: (rust) => {
      rust.setSelectionByText('second', 0)
      rust.request({ type: 'indent_list_item' })
    }
  },
  {
    name: 'outdent the only nested item and remove its empty list',
    initial: '- parent\n  - child\n- sibling',
    expected: '- parent\n- child\n- sibling\n',
    runJs: async (muya) => {
      setJsSelectionByText(muya, 'child', 0)
      muya.contentState.tabHandler(fakeKeyEvent({ shiftKey: true }))
    },
    runRust: (rust) => {
      rust.setSelectionByText('child', 0)
      rust.request({ type: 'outdent_list_item' })
    }
  },
  {
    name: 'outdent the final nested item while keeping its sibling nested',
    initial: '- parent\n  - first\n  - second',
    expected: '- parent\n  - first\n- second\n',
    runJs: async (muya) => {
      setJsSelectionByText(muya, 'second', 0)
      runDiagnosedTab(muya, 'outdent-second', fakeKeyEvent({ shiftKey: true }))
    },
    runRust: (rust) => {
      rust.setSelectionByText('second', 0)
      rust.request({ type: 'outdent_list_item' })
    }
  }
]

describeBundled('Muya nested-list differential traces', () => {
  let jsEditor = null

  beforeAll(initializeRustWasm)

  afterEach(() => {
    jsEditor?.destroy?.()
    jsEditor = null
    document.body.innerHTML = ''
  })

  for (const trace of traces) {
    it(trace.name, async () => {
      const result = await runDifferentialTrace(trace)
      jsEditor = result.jsEditor
      expect(result.jsMarkdown).toBe(result.rustMarkdown)
      expect(result.rustMarkdown).toBe(trace.expected)
    })
  }
})
