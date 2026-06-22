import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'

import installBootstrapGlobals from '../../src/renderer/src/platform/bootstrapGlobals.js'

describe('global Muya runtime bridge', () => {
  it('installs the Muya runtime bridge during bootstrap globals', () => {
    const dom = new JSDOM('<div id="editor"></div>')
    const target = {
      document: dom.window.document,
      getSelection: dom.window.getSelection.bind(dom.window)
    }
    installBootstrapGlobals(target)
    expect(target.__ELEPHANT_MUYA_RUNTIME__).toBeTruthy()
    expect(target.__ELEPHANT_MUYA_RUNTIME__.mode()).toBe('disabled')
    expect(target.__ELEPHANT_MUYA_RUNTIME__.setMode('shadow')).toBe('shadow')
    expect(target.__ELEPHANT_MUYA_RUNTIME__.enabled()).toBe(true)
  })

  it('can create a runtime editor from the global bridge', () => {
    const dom = new JSDOM('<div id="editor"></div>')
    const target = {
      document: dom.window.document,
      getSelection: dom.window.getSelection.bind(dom.window)
    }
    installBootstrapGlobals(target)
    const root = dom.window.document.getElementById('editor')
    const runtime = target.__ELEPHANT_MUYA_RUNTIME__.createEditor(root, '# Global')
    expect(root.getAttribute('data-muya-editor')).toBe('true')
    expect(runtime.markdown).toContain('# Global')
  })
})
