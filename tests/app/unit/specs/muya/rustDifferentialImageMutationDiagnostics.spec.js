import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { tokenizer } from '../../../../../Elephant/frontend/src/muya/lib/parser'
import {
  bundled,
  createJsEditor,
  initializeRustWasm,
  settle
} from './rustDifferentialHarness'

const describeBundled = bundled ? describe : describe.skip

const editableBlocks = (muya) => {
  const output = []
  const visit = (block) => {
    if (block?.functionType === 'paragraphContent') output.push(block)
    for (const child of block?.children || []) visit(child)
  }
  for (const block of muya.contentState.getBlocks()) visit(block)
  return output
}

const findImageToken = (tokens) => {
  for (const token of tokens) {
    if (token.type === 'image') return token
    const nested = findImageToken(token.children || [])
    if (nested) return nested
  }
  return null
}

const imageInfo = (muya) => {
  const block = editableBlocks(muya).find((candidate) => candidate.text.includes('!['))
  if (!block) throw new Error('Muya image paragraph was not found.')
  const token = findImageToken(tokenizer(block.text))
  if (!token) throw new Error('Muya image token was not found.')
  return { key: block.key, token }
}

const cases = [
  {
    name: 'replace a Markdown image in surrounding text',
    initial: 'before ![old](old.png "Old") after',
    run: (muya) => muya.contentState.replaceImage(imageInfo(muya), {
      src: 'new image.png',
      alt: 'new alt',
      title: 'New title'
    })
  },
  {
    name: 'delete a Markdown image from surrounding text',
    initial: 'before ![old](old.png) after',
    run: (muya) => muya.contentState.deleteImage(imageInfo(muya))
  },
  {
    name: 'delete the only image in a paragraph',
    initial: '![old](old.png)',
    run: (muya) => muya.contentState.deleteImage(imageInfo(muya))
  }
]

describeBundled('Muya image mutation characterization', () => {
  let jsEditor = null

  beforeAll(initializeRustWasm)

  afterEach(() => {
    jsEditor?.destroy?.()
    jsEditor = null
    document.body.innerHTML = ''
  })

  for (const testCase of cases) {
    it(testCase.name, async () => {
      jsEditor = await createJsEditor(testCase.initial)
      await testCase.run(jsEditor)
      await settle()
      console.log(
        '[muya-image-mutation]',
        testCase.name,
        JSON.stringify({
          markdown: jsEditor.getMarkdown(),
          cursor: jsEditor.contentState.cursor
        })
      )
      expect(typeof jsEditor.getMarkdown()).toBe('string')
    })
  }

  it('characterizes replace and delete history', async () => {
    jsEditor = await createJsEditor('before ![old](old.png) after')
    await jsEditor.contentState.replaceImage(imageInfo(jsEditor), {
      src: 'new.png',
      alt: 'new',
      title: ''
    })
    const replaced = jsEditor.getMarkdown()
    jsEditor.undo()
    const replaceUndo = jsEditor.getMarkdown()
    jsEditor.redo()
    const replaceRedo = jsEditor.getMarkdown()
    await jsEditor.contentState.deleteImage(imageInfo(jsEditor))
    const deleted = jsEditor.getMarkdown()
    jsEditor.undo()
    const deleteUndo = jsEditor.getMarkdown()
    jsEditor.redo()
    console.log('[muya-image-mutation-history]', JSON.stringify({
      replaced,
      replaceUndo,
      replaceRedo,
      deleted,
      deleteUndo,
      deleteRedo: jsEditor.getMarkdown()
    }))
    expect(typeof deleted).toBe('string')
  })
})
