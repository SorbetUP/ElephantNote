import { describe, expect, it, vi } from 'vitest'

import {
  createRealMuyaRustMirror,
  muyaIndexCursorToSelection
} from '../../../Elephant/frontend/src/renderer/src/muya/realMuyaRustMirrorRuntime.js'

const stateFor = (markdown, revision = 0, selection = null, undoStack = []) => ({
  markdown,
  selection: selection || { anchor: markdown.length, focus: markdown.length },
  revision,
  undoStack,
  redoStack: []
})

const createInvoke = () => {
  let state = null
  return vi.fn(async(command, payload = {}) => {
    if (command === 'tauri_muya_engine_create') {
      state = stateFor(String(payload.markdown || ''), 0)
      return state
    }
    if (command === 'tauri_muya_engine_sync_document') {
      const previous = state
      state = stateFor(
        String(payload.markdown || ''),
        (previous?.revision || 0) + 1,
        payload.selection,
        [...(previous?.undoStack || []), {
          markdown: previous?.markdown || '',
          selection: previous?.selection || { anchor: 0, focus: 0 }
        }]
      )
      return {
        state,
        documentChanged: previous?.markdown !== state.markdown,
        selectionChanged: true
      }
    }
    if (command === 'tauri_muya_engine_apply') {
      if (payload.command?.type !== 'setSelection') {
        throw new Error(`Unexpected apply command: ${payload.command?.type}`)
      }
      state = {
        ...state,
        selection: {
          anchor: payload.command.anchor,
          focus: payload.command.focus
        }
      }
      return { state, documentChanged: false, selectionChanged: true }
    }
    if (command === 'tauri_muya_engine_query') {
      return {
        type: 'muya-json-state',
        blocks: payload.state?.markdown ? [{ type: 'paragraph' }] : []
      }
    }
    throw new Error(`Unexpected command: ${command}`)
  })
}

describe('real Muya Rust mirror', () => {
  it('keeps the real Muya surface while validating its Markdown in persistent Rust state', async() => {
    const target = {}
    const invoke = createInvoke()
    const logger = { info: vi.fn(), debug: vi.fn(), error: vi.fn() }
    const mirror = createRealMuyaRustMirror({
      initialMarkdown: '# Hello',
      invoke,
      target,
      logger
    })

    await mirror.ready

    expect(mirror.active).toBe(true)
    expect(mirror.status.phase).toBe('ready')
    expect(mirror.status.markdownLength).toBe(7)
    expect(mirror.status.blocks).toBe(1)
    expect(target.__ELEPHANT_ACTIVE_EDITOR_ENGINE__).toBe('muya-ui-rust-core')
    expect(target.__ELEPHANT_MUYA_RUST_MIRROR__.phase).toBe('ready')
    expect(invoke).toHaveBeenCalledWith('tauri_muya_engine_create', { markdown: '# Hello' })
    expect(invoke).toHaveBeenCalledWith('tauri_muya_engine_query', expect.objectContaining({
      query: { type: 'jsonState' }
    }))
  })

  it('coalesces rapid Muya changes and persists only the latest document', async() => {
    const invoke = createInvoke()
    const mirror = createRealMuyaRustMirror({
      initialMarkdown: 'a',
      invoke,
      target: {},
      logger: { info: vi.fn(), debug: vi.fn(), error: vi.fn() }
    })

    await mirror.ready
    mirror.sync('ab', 'muya-change')
    mirror.sync('abc', 'muya-change')
    mirror.sync('abcd', 'muya-change')
    await mirror.flush()

    expect(mirror.status.phase).toBe('ready')
    expect(mirror.status.markdownLength).toBe(4)
    expect(mirror.state.markdown).toBe('abcd')
    const syncCalls = invoke.mock.calls.filter(([command]) => command === 'tauri_muya_engine_sync_document')
    expect(syncCalls.at(-1)[1]).toEqual(expect.objectContaining({
      markdown: 'abcd',
      selection: { anchor: 4, focus: 4 }
    }))
    expect(syncCalls.length).toBeLessThanOrEqual(2)
  })

  it('converts Muya line and column cursors to JavaScript UTF-16 offsets', () => {
    const markdown = 'a😀b\nsecond'
    expect(muyaIndexCursorToSelection(markdown, {
      anchor: { line: 0, ch: 3 },
      focus: { line: 1, ch: 2 }
    })).toEqual({
      anchor: 3,
      focus: 7
    })
  })

  it('persists Muya selection and grouped-history intent in Rust', async() => {
    const invoke = createInvoke()
    const mirror = createRealMuyaRustMirror({
      initialMarkdown: 'one\ntwo',
      invoke,
      target: {},
      logger: { info: vi.fn(), debug: vi.fn(), error: vi.fn() }
    })
    await mirror.ready

    await mirror.sync('one\ntwo!', 'muya-change', {
      muyaIndexCursor: {
        anchor: { line: 1, ch: 4 },
        focus: { line: 1, ch: 4 }
      },
      continueGroup: true
    })
    await mirror.flush()

    expect(mirror.state.selection).toEqual({ anchor: 8, focus: 8 })
    expect(invoke).toHaveBeenCalledWith('tauri_muya_engine_sync_document', expect.objectContaining({
      markdown: 'one\ntwo!',
      selection: { anchor: 8, focus: 8 },
      continueGroup: true
    }))
  })

  it('stays disabled outside Tauri instead of replacing Muya with a fallback renderer', async() => {
    const target = {}
    const mirror = createRealMuyaRustMirror({ initialMarkdown: 'text', target })

    expect(mirror.active).toBe(false)
    expect(mirror.status.phase).toBe('disabled')
    expect(mirror.status.reason).toBe('tauri-invoke-unavailable')
    expect(target.__ELEPHANT_ACTIVE_EDITOR_ENGINE__).toBeUndefined()
    await expect(mirror.sync('next')).resolves.toBe(mirror.status)
  })

  it('reports Rust divergence without modifying the Muya DOM or Markdown', async() => {
    const target = {}
    const logger = { info: vi.fn(), debug: vi.fn(), error: vi.fn() }
    const invoke = vi.fn(async(command, payload = {}) => {
      if (command === 'tauri_muya_engine_create') return stateFor(`${payload.markdown}!`, 1)
      if (command === 'tauri_muya_engine_query') return { type: 'muya-json-state', blocks: [] }
      throw new Error(`Unexpected command: ${command}`)
    })
    const mirror = createRealMuyaRustMirror({ initialMarkdown: 'safe', invoke, target, logger })

    await mirror.ready

    expect(mirror.status.phase).toBe('error')
    expect(mirror.status.error).toContain('changed the Markdown')
    expect(logger.error).toHaveBeenCalled()
  })
})
