import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildNoteCitationMarkdown,
  decodeQuoteAnchor,
  encodeQuoteAnchor,
  installNoteCitationRuntime,
  normalizeCitationText,
  resolveInternalNoteLink
} from '@/platform/noteCitationRuntime'

const createVaultStore = (openedNotePath = 'Projects/Destination.md') => ({
  openedNotePath,
  openNote: vi.fn(function(entry) {
    this.openedNotePath = entry.path
  })
})

const flushPromises = async() => {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  window.__ELEPHANT_NOTE_CITATION_RUNTIME__?.dispose?.()
  document.body.innerHTML = ''
  delete window.__ELEPHANT_NOTE_CITATION_RUNTIME__
  delete window.__ELEPHANT_DEBUG_LOGS__
  vi.restoreAllMocks()
})

afterEach(() => {
  window.__ELEPHANT_NOTE_CITATION_RUNTIME__?.dispose?.()
  document.body.innerHTML = ''
})

describe('note text citations', () => {
  it('round-trips Unicode source text through a compact quote anchor', () => {
    const source = 'Éléphant — citation précise\navec une deuxième ligne 🐘'
    const encoded = encodeQuoteAnchor(source)

    expect(encoded).not.toContain('+')
    expect(encoded).not.toContain('/')
    expect(decodeQuoteAnchor(encoded)).toBe(source)
  })

  it('builds a multiline Markdown quote with a vault-rooted clickable source', () => {
    const citation = buildNoteCitationMarkdown({
      text: 'Première ligne\n\nDeuxième ligne',
      notePath: 'Recherche/Note source.md',
      noteTitle: 'Note source'
    })

    expect(citation).toMatch(/^> Première ligne\n>\n> Deuxième ligne/)
    expect(citation).toContain('> — [Note source](</Recherche/Note%20source.md#quote=')
    expect(citation).toMatch(/>\)$/)
  })

  it('normalizes copied text without destroying intentional blank lines', () => {
    expect(normalizeCitationText('  début  \r\n\r\nfin\t ')).toBe('début\n\nfin')
  })

  it('resolves rooted and relative note links while rejecting external URLs', () => {
    const rooted = resolveInternalNoteLink({
      href: '/Recherche/Note%20source.md#quote=' + encodeQuoteAnchor('passage'),
      currentNotePath: 'Projects/Destination.md',
      appOrigin: 'http://tauri.localhost'
    })
    expect(rooted).toEqual({
      path: 'Recherche/Note source.md',
      anchor: expect.stringMatching(/^quote=/),
      quote: 'passage'
    })

    expect(resolveInternalNoteLink({
      href: '../Sources/Autre.md#Conclusion',
      currentNotePath: 'Projects/Journal/Destination.md'
    })).toEqual({
      path: 'Projects/Sources/Autre.md',
      anchor: 'Conclusion',
      quote: ''
    })

    expect(resolveInternalNoteLink({
      href: 'https://example.com/note.md',
      currentNotePath: 'Projects/Destination.md',
      appOrigin: 'http://tauri.localhost'
    })).toBeNull()
  })

  it('adds the citation action and copies the selected editor text', async() => {
    document.body.innerHTML = `
      <header class="en-note-topbar">
        <input class="en-note-title-input" value="Source note">
        <div class="en-note-topbar-actions"></div>
      </header>
      <div class="en-editor-host"><p id="source">Texte réellement sélectionné.</p></div>
    `
    const clipboardWrite = vi.fn(async() => {})
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite }
    })
    const vaultStore = createVaultStore('Sources/Source note.md')
    installNoteCitationRuntime({ vaultStore, target: window })

    const paragraph = document.getElementById('source')
    const range = document.createRange()
    range.selectNodeContents(paragraph)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)

    const button = document.querySelector('[data-elephant-note-citation]')
    expect(button).not.toBeNull()
    button.click()
    await flushPromises()

    expect(clipboardWrite).toHaveBeenCalledTimes(1)
    expect(clipboardWrite.mock.calls[0][0]).toContain('> Texte réellement sélectionné.')
    expect(clipboardWrite.mock.calls[0][0]).toContain('[Source note](</Sources/Source%20note.md#quote=')
    expect(document.querySelector('[data-elephant-citation-feedback]')?.textContent)
      .toContain('Citation copiée')
  })

  it('intercepts a citation link, opens the source note and keeps navigation inside Elephant', () => {
    const quote = encodeQuoteAnchor('Passage source')
    document.body.innerHTML = `
      <div class="en-note-topbar-actions"></div>
      <div class="en-editor-host">
        <a id="citation" href="/Sources/Source.md#quote=${quote}">Source</a>
      </div>
    `
    const vaultStore = createVaultStore('Projects/Destination.md')
    installNoteCitationRuntime({ vaultStore, target: window })

    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    document.getElementById('citation').dispatchEvent(click)

    expect(click.defaultPrevented).toBe(true)
    expect(vaultStore.openNote).toHaveBeenCalledWith({
      path: 'Sources/Source.md',
      title: 'Source',
      kind: 'note',
      type: 'note'
    })
  })
})
