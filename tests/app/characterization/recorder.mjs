import { createMount, installDeterministicBrowser, settle } from './environment.mjs'
import { documentCases, operationCases } from './scenarios.mjs'
import {
  buildBlockKeyMap,
  normalizeBlocks,
  normalizeCursor,
  normalizeDom,
  normalizeRuntimeText,
  normalizeValue
} from './normalize.mjs'

const editorOptions = (markdown) => ({
  markdown,
  t: (key) => key,
  footnote: true,
  superSubScript: true,
  disableHtml: false,
  imageAction: async(source) => source,
  imagePathAutoComplete: () => [],
  clipboardFilePath: () => {}
})

const safe = (callback) => {
  try {
    return { ok: true, value: callback() }
  } catch (error) {
    return {
      ok: false,
      error: {
        name: error?.name || 'Error',
        message: error?.message || String(error)
      }
    }
  }
}

const publicApi = (Constructor) => {
  const descriptors = Object.getOwnPropertyDescriptors(Constructor.prototype)
  return Object.keys(descriptors).sort().map((name) => ({
    name,
    kind: typeof descriptors[name].value === 'function' ? 'method' : 'property',
    enumerable: Boolean(descriptors[name].enumerable),
    configurable: Boolean(descriptors[name].configurable),
    writable: Boolean(descriptors[name].writable)
  }))
}

const historySnapshot = (editor, keyMap) => {
  const result = safe(() => editor.getHistory())
  if (!result.ok) return result
  const history = result.value || {}
  return {
    ok: true,
    value: {
      index: history.index,
      lastEditIndex: history.lastEditIndex,
      stackLength: Array.isArray(history.stack) ? history.stack.length : null,
      pendingIndex: editor.contentState?.history?.pendingIndex ?? null,
      stack: normalizeValue(history.stack || [], keyMap)
    }
  }
}

const capture = (editor, events) => {
  const blocksResult = safe(() => editor.contentState.getBlocks())
  const blocks = blocksResult.ok ? blocksResult.value : []
  const normalizedBlocks = normalizeBlocks(blocks)
  const keyMap = normalizedBlocks.keyMap
  const markdown = safe(() => editor.getMarkdown())
  const cursor = safe(() => editor.getCursor())
  const indexCursor = safe(() => editor.contentState.getMuyaIndexCursor())
  const toc = safe(() => editor.getTOC())

  return {
    markdown,
    blocks: blocksResult.ok ? { ok: true, value: normalizedBlocks.value } : blocksResult,
    cursor: cursor.ok ? { ok: true, value: normalizeCursor(cursor.value, keyMap) } : cursor,
    indexCursor: indexCursor.ok ? { ok: true, value: normalizeValue(indexCursor.value, keyMap) } : indexCursor,
    history: historySnapshot(editor, keyMap),
    toc: toc.ok ? { ok: true, value: normalizeValue(toc.value, keyMap) } : toc,
    searchMatches: normalizeValue(editor.contentState?.searchMatches || null, keyMap),
    dom: normalizeDom(editor.container, keyMap),
    documentText: normalizeRuntimeText(editor.container?.textContent || ''),
    events: events.map((event) => normalizeValue(event, keyMap))
  }
}

const registerEvents = (editor, events) => {
  for (const name of ['change', 'selectionChange', 'selectionFormats', 'scroll', 'focus', 'blur', 'crashed']) {
    editor.on(name, (payload) => {
      const blocks = editor.contentState?.getBlocks?.() || []
      const keyMap = buildBlockKeyMap(blocks)
      events.push({ name, payload: normalizeValue(payload, keyMap) })
    })
  }
}

const applyAction = async(editor, action) => {
  if (action.type === 'cursor') {
    return editor.setMarkdown(editor.getMarkdown(), undefined, true, {
      anchor: action.anchor,
      focus: action.focus
    })
  }
  if (action.type === 'call') {
    const method = editor[action.method]
    if (typeof method !== 'function') throw new TypeError(`Missing Muya method: ${action.method}`)
    return method.apply(editor, action.args || [])
  }
  if (action.type === 'key') {
    editor.container.focus()
    const event = new KeyboardEvent('keydown', {
      key: action.key,
      code: action.code || action.key,
      shiftKey: Boolean(action.shiftKey),
      altKey: Boolean(action.altKey),
      ctrlKey: Boolean(action.ctrlKey),
      metaKey: Boolean(action.metaKey),
      bubbles: true,
      cancelable: true
    })
    return editor.container.dispatchEvent(event)
  }
  throw new TypeError(`Unknown characterization action: ${action.type}`)
}

const runCase = async(Muya, testCase, seed) => {
  installDeterministicBrowser(seed)
  const events = []
  let editor
  let constructionError = null

  try {
    editor = new Muya(createMount(), editorOptions(testCase.markdown))
    registerEvents(editor, events)
    await settle()
  } catch (error) {
    constructionError = { name: error?.name || 'Error', message: error?.message || String(error) }
  }

  if (!editor) return { name: testCase.name, constructionError, steps: [] }

  const contentStateApi = publicApi(editor.contentState.constructor)
  const steps = [{ name: 'initial', state: capture(editor, events) }]
  for (const [index, action] of (testCase.actions || []).entries()) {
    let result
    try {
      const value = await applyAction(editor, action)
      await settle()
      result = { ok: true, value: normalizeValue(value) }
    } catch (error) {
      await settle()
      result = {
        ok: false,
        error: { name: error?.name || 'Error', message: error?.message || String(error) }
      }
    }
    steps.push({
      name: `${index + 1}:${action.type}:${action.method || action.key || 'action'}`,
      action,
      result,
      state: capture(editor, events)
    })
  }

  const destroyResult = safe(() => editor.destroy())
  return { name: testCase.name, constructionError, contentStateApi, steps, destroyResult }
}

export const runCharacterization = async(Muya) => {
  if (Array.isArray(Muya.plugins)) Muya.plugins.length = 0
  const cases = [...documentCases, ...operationCases]
  const results = []
  for (const [index, testCase] of cases.entries()) {
    results.push(await runCase(Muya, testCase, index + 1))
  }
  return {
    schemaVersion: 2,
    publicApi: publicApi(Muya),
    cases: results
  }
}
