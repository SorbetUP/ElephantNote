import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync('Elephant/front/app/components/editor/NoteEditorHost.vue', 'utf8')

describe('NoteEditorHost Excalidraw image link formatting', () => {
  it('inserts Excalidraw previews through the markdown image source formatter', () => {
    expect(source).toContain('toMarkdownImageSource')
    expect(source).toContain('const source = toMarkdownImageSource(targetPath, currentNoteDirectory.value)')
    expect(source).toContain('const imageMarkdown = `![${resolvedName}](${source})`')
    expect(source).toContain("filter(Boolean).join('\\n\\n')")
  })

  it('does not insert raw local filesystem paths for new Excalidraw previews', () => {
    const saveExcalidrawBody = source.slice(source.indexOf('const saveExcalidraw = async'))
    expect(saveExcalidrawBody).not.toContain('resolveLocalImageSource(targetPath')
  })

  it('opens existing image-backed drawings from their Excalidraw sidecar', () => {
    expect(source).toContain('const openExcalidrawFromImage = async(src) => {')
    expect(source).toContain('const imagePath = resolveLocalImageSource(src, baseDir)')
    expect(source).toContain('const scenePath = getExcalidrawScenePath(previewPath)')
    expect(source).toContain("await readLocalBlob(scenePath, 'application/vnd.excalidraw+json')")
    expect(source).toContain("insertOnSave: false")
    expect(source).toContain("bus.on('open-excalidraw-from-image', openExcalidrawFromImage)")
    expect(source).toContain("bus.off('open-excalidraw-from-image', openExcalidrawFromImage)")
  })
})
