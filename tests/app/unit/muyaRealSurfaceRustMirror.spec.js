import { describe, expect, it, vi } from 'vitest'

import {
  createRealMuyaRustMirror,
  muyaIndexCursorToSelection,
  selectionToMuyaIndexCursor
} from '../../../Elephant/frontend/src/renderer/src/muya/realMuyaRustMirrorRuntime.js'

const stateFor = (
  markdown,
  revision = 0,
  selection = null,
  undoStack = [],
  redoStack = []
) => ({
  markdown,
  selection: selection || { anchor: markdown.length, focus: markdown.length },
  revision,
  undoStack,
  redoStack
})

const snapshot = (state) => ({
  markdown: state.markdown,
  selection: { ...state.selection }
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
      const undoStack = payload.continueGroup && previous.undoStack.length
        ? [...previous.undoStack]
        : [...previous.undoStack, snapshot(previous)]
      state = stateFor(
        String(payload.markdown || ''),
        previous.revision + 1,
        payload.selection,
        undoStack,
        []
      )
      return {
        state,
        documentChanged: previous.markdown !== state.markdown,
        selectionChanged: true
      }
    }
    if (command === 'tauri_muya_engine_apply') {
      if (payload.command?.type === 'setSelection') {
        state = {
          ...state,
          selection: {
            anchor: payload.command.anchor,
            focus: payload.command.focus
          }
        }
        return { state, documentChanged: false, selectionChanged: true }
      }
      if (payload.command?.type === 'undo') {
        const previous = state.undoStack.at(-1)
        if (!previous) return { state, documentChanged: false, selectionChanged: false }
        state = stateFor(
          previous.markdown,
          state.revision + 1,
          previous.selection,
          state.undoStack.slice(0, -1),
          [...state.redoStack, snapshot(state)]
        )
        return { state, documentChanged: true, selectionChanged: true }
      }
      if (payload.command?.type === 'redo') {
        const next = state.redoStack.at(-1)
        if (!next) return { state, documentChanged: false, selectionChanged: false }
        state = stateFor(
          next.markdown,
          state.revision + 1,
          next.selection,
          [...state.undoStack, snapshot(state)],
          state.redoStack.slice(0, -1)
        )
        return { state, documentChanged: true, selectionChanged: true }
      }
      throw new Error(`Unexpected apply command: ${payload.command?.type}`)
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

describe('real Muya Rust core', () => {
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
    expect(mirror.status.undoDepth).toBe(0)
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

  it('round-trips Muya cursors and Rust UTF-16 selections across lines and emoji', () => {
    const markdown = 'a😀b\nsecond'
    const selection = muyaIndexCursorToSelection(markdown, {
      anchor: { line: 0, ch: 3 },
      focus: { line: 1, ch: 2 }
    })
    expect(selection).toEqual({ anchor: 3, focus: 7 })
    expect(selectionToMuyaIndexCursor(markdown, selection)).toEqual({
      anchor: { line: 0, ch: 3 },
      focus: { line: 1, ch: 2 }
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

  it('uses Rust for undo and redo while preserving selection', async() => {
    const mirror = createRealMuyaRustMirror({
      initialMarkdown: 'one',
      invoke: createInvoke(),
      target: {},
      logger: { info: vi.fn(), debug: vi.fn(), error: vi.fn() }
    })
    await mirror.ready
    await mirror.sync('one!', 'muya-change', {
      selection: { anchor: 4, focus: 4 }
    })
    await mirror.flush()

    const undo = await mirror.undo()
    expect(undo.documentChanged).toBe(true)
    expect(undo.state.markdown).toBe('one')
    expect(undo.state.selection).toEqual({ anchor: 3, focus: 3 })
    expect(mirror.status.redoDepth).toBe(1)

    const redo = await mirror.redo()
    expect(redo.documentChanged).toBe(true)
    expect(redo.state.markdown).toBe('one!')
    expect(redo.state.selection).toEqual({ anchor: 4, focus: 4 })
    expect(mirror.status.undoDepth).toBe(1)
  })

  it('resets Rust history when Muya opens another note', async() => {
    const mirror = createRealMuyaRustMirror({
      initialMarkdown: 'first',
      invoke: createInvoke(),
      target: {},
      logger: { info: vi.fn(), debug: vi.fn(), error: vi.fn() }
    })
    await mirror.ready
    await mirror.sync('first!', 'muya-change')
    await mirror.flush()
    expect(mirror.status.undoDepth).toBe(1)

    await mirror.reset('second', 'set-markdown')
    await mirror.flush()
    expect(mirror.state.markdown).toBe('second')
    expect(mirror.status.undoDepth).toBe(0)
    expect(mirror.status.redoDepth).toBe(0)
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
