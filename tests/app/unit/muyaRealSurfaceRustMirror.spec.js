import { describe, expect, it, vi } from 'vitest'

import { createRealMuyaRustMirror } from '../../../Elephant/frontend/src/renderer/src/muya/realMuyaRustMirrorRuntime.js'

const stateFor = (markdown, revision = 0) => ({
  markdown,
  selection: { anchor: markdown.length, focus: markdown.length },
  revision,
  undoStack: [],
  redoStack: []
})

const createInvoke = () => {
  let revision = 0
  return vi.fn(async(command, payload = {}) => {
    if (command === 'tauri_muya_engine_create') {
      revision += 1
      return stateFor(String(payload.markdown || ''), revision)
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
  it('keeps the real Muya surface while validating its Markdown in Rust', async() => {
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
    expect(target.__ELEPHANT_ACTIVE_EDITOR_ENGINE__).toBe('muya-ui-rust-mirror')
    expect(target.__ELEPHANT_MUYA_RUST_MIRROR__.phase).toBe('ready')
    expect(invoke).toHaveBeenCalledWith('tauri_muya_engine_create', { markdown: '# Hello' })
    expect(invoke).toHaveBeenCalledWith('tauri_muya_engine_query', expect.objectContaining({
      query: { type: 'jsonState' }
    }))
  })

  it('coalesces rapid Muya changes and validates the latest document', async() => {
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
    const createCalls = invoke.mock.calls.filter(([command]) => command === 'tauri_muya_engine_create')
    expect(createCalls.at(-1)[1]).toEqual({ markdown: 'abcd' })
    expect(createCalls.length).toBeLessThanOrEqual(3)
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
