import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync('Elephant/front/app/components/editor/NoteEditorHost.vue', 'utf8')

describe('NoteEditorHost Excalidraw image link formatting', () => {
  it('inserts Excalidraw previews through the markdown image source formatter', () => {
    expect(source).toContain("import { toMarkdownImageSource } from '../../../../shared/imageSource.js'")
    expect(source).toContain('const source = toMarkdownImageSource(targetPath, currentNoteDirectory.value)')
    expect(source).toContain('const imageMarkdown = `![${resolvedName}](${source})`')
    expect(source).toContain("filter(Boolean).join('\\n\\n')")
  })

  it('does not insert raw local filesystem paths for new Excalidraw previews', () => {
    const saveExcalidrawBody = source.slice(source.indexOf('const saveExcalidraw = async'))
    expect(saveExcalidrawBody).not.toContain('resolveLocalImageSource(targetPath')
  })
})
