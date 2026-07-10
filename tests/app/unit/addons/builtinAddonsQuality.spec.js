import { afterEach, describe, expect, it, vi } from 'vitest'

const success = vi.fn()
vi.mock('element-plus', () => ({ ElMessage: { success } }))

import { dailyNotesAddon } from '../../../../Elephant/frontend/src/renderer/src/addons/builtin/dailyNotes.js'
import { quickCaptureAddon } from '../../../../Elephant/frontend/src/renderer/src/addons/builtin/quickCapture.js'
import { reportMarkdown } from '../../../../Elephant/frontend/src/renderer/src/addons/builtin/vaultOverview.js'

const activateSingleAction = (addon) => {
  let action
  addon.activate({
    logger: { info: vi.fn() },
    addAction(definition) { action = definition },
    addSettingsSection: vi.fn()
  })
  return action
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('improved built-in addons', () => {
  it('creates a linked daily workspace without overwriting an existing note', async () => {
    const invoke = vi.fn(async (command, payload) => {
      if (command === 'tauri_notes_read') throw new Error('not found')
      if (command === 'tauri_notes_write') return { changed: true, path: payload.relativePath }
      throw new Error(`Unexpected command: ${command}`)
    })
    vi.stubGlobal('__TAURI__', { core: { invoke } })

    const result = await activateSingleAction(dailyNotesAddon).run()
    const write = invoke.mock.calls.find(([command]) => command === 'tauri_notes_write')

    expect(result.created).toBe(true)
    expect(write[1].content).toContain('## Focus')
    expect(write[1].content).toContain('## End-of-day review')
    expect(write[1].content).toMatch(/← \[\[Daily\/\d{4}-\d{2}-\d{2}/)
  })

  it('accepts structured quick-capture payloads and marks them unprocessed', async () => {
    const invoke = vi.fn(async (command, payload) => {
      if (command === 'tauri_notes_write') return { changed: true, path: payload.relativePath }
      throw new Error(`Unexpected command: ${command}`)
    })
    vi.stubGlobal('__TAURI__', { core: { invoke } })

    const result = await activateSingleAction(quickCaptureAddon).run({
      title: 'Investigate addon signing',
      content: 'Compare package signatures and publisher trust.'
    })
    const write = invoke.mock.calls[0][1]

    expect(result.path).toMatch(/^Inbox\/Quick capture /)
    expect(write.content).toContain('title: "Investigate addon signing"')
    expect(write.content).toContain('status: "unprocessed"')
    expect(write.content).toContain('Compare package signatures')
  })

  it('produces deterministic graph coverage and connected-note sections', () => {
    const markdown = reportMarkdown({
      documents: [
        { relativePath: 'B.md', title: 'B' },
        { relativePath: 'A.md', title: 'A' },
        { relativePath: 'Orphan.md', title: 'Orphan' }
      ],
      graph: {
        edges: [
          { source: 'A.md', target: 'B.md' },
          { source: 'A.md', target: 'B.md' }
        ]
      }
    }, '2026-07-10T00:00:00.000Z')

    expect(markdown).toContain('- Link coverage: 67%')
    expect(markdown).toContain('## Most connected notes')
    expect(markdown).toContain('[[B|B]] — 2 incoming, 0 outgoing')
    expect(markdown.indexOf('[[A|A]]')).toBeLessThan(markdown.indexOf('[[B|B]]', markdown.indexOf('## Note index')))
    expect(markdown).toContain('[[Orphan|Orphan]]')
  })
})
