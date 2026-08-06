import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'

import {
  createRuntimeFileHandlers,
  storeDroppedAttachment
} from '../../Elephant/frontend/src/renderer/src/components/editorWithTabs/runtimeFileLinks.js'
import { rustBusCommand } from '../../Elephant/frontend/src/renderer/src/components/editorWithTabs/runtimeEditorCommands.js'

const createTarget = () => {
  const operations = []
  return {
    operations,
    path: path.posix,
    tauri: {
      webUtils: {
        getPathForFile: (file) => file.path || ''
      }
    },
    fileUtils: {
      ensureDir: async (directory) => operations.push(['ensureDir', directory]),
      pathExists: async () => false,
      copy: async (source, destination) => operations.push(['copy', source, destination]),
      writeFile: async (destination, bytes, encoding) => operations.push(['writeFile', destination, bytes.byteLength, encoding]),
      isChildOfDirectory: (root, candidate) => candidate.startsWith(`${root}/`)
    }
  }
}

const droppedFile = ({ name, type, source }) => ({
  name,
  type,
  path: source,
  arrayBuffer: async () => new TextEncoder().encode(`bytes:${name}`).buffer
})

const currentFile = { pathname: '/vault/Feature.md' }
const projectRoot = { pathname: '/vault' }

test('stores a dropped image and emits image Markdown', async () => {
  const target = createTarget()
  const result = await storeDroppedAttachment({
    file: droppedFile({ name: 'drop.png', type: 'image/png', source: '/external/drop.png' }),
    currentFile,
    projectRoot,
    target
  })

  assert.equal(result.image, true)
  assert.equal(result.relativePath, '.assets/drop.png')
  assert.equal(result.markdown, '![drop.png](.assets/drop.png)')
  assert.deepEqual(target.operations, [
    ['ensureDir', '/vault/.assets'],
    ['copy', '/external/drop.png', '/vault/.assets/drop.png']
  ])
})

test('stores a dropped file and emits clickable link Markdown', async () => {
  const target = createTarget()
  const result = await storeDroppedAttachment({
    file: droppedFile({ name: 'linked file.pdf', type: 'application/pdf', source: '/external/linked file.pdf' }),
    currentFile,
    projectRoot,
    target
  })

  assert.equal(result.image, false)
  assert.equal(result.relativePath, '.assets/linked file.pdf')
  assert.equal(result.markdown, '[linked file.pdf](.assets/linked%20file.pdf)')
})

test('dispatches one canonical paste_markdown command for dropped files', async () => {
  const target = createTarget()
  const calls = []
  const handlers = createRuntimeFileHandlers({
    currentFile: { value: currentFile },
    projectTree: { value: projectRoot },
    target,
    dispatch: async (...args) => {
      calls.push(args)
      return { revision: 1 }
    }
  })

  const result = await handlers.dropped([
    droppedFile({ name: 'report.pdf', type: 'application/pdf', source: '/external/report.pdf' })
  ])

  assert.equal(result.relativePath, '.assets/report.pdf')
  assert.deepEqual(calls, [['paste-markdown', '[report.pdf](.assets/report.pdf)']])
})

test('maps paste-markdown to the Rust protocol command', () => {
  assert.deepEqual(
    rustBusCommand('paste-markdown', '![drop.png](.assets/drop.png)'),
    { type: 'paste_markdown', markdown: '![drop.png](.assets/drop.png)' }
  )
})
