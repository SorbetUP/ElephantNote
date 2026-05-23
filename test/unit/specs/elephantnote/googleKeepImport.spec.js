import { describe, expect, it } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import {
  buildGoogleKeepMarkdown,
  importGoogleKeepExport,
  parseGoogleKeepNote,
  parseGoogleKeepTimestamp,
  sanitizeFileStem
} from 'main_renderer/elephantnote/googleKeepImport'

describe('Google Keep import helpers', () => {
  it('parses Keep note payloads into a normalized note object', () => {
    const note = parseGoogleKeepNote({
      title: '  Weekend plan  ',
      textContent: 'First line\r\nSecond line',
      listContent: [
        { text: 'Buy bread', isChecked: false },
        { text: 'Call Alice', isChecked: true }
      ],
      attachments: [
        { filePath: 'keep/photo.png', mimetype: 'image/png' }
      ],
      createdTimestampUsec: '1700000000000000',
      userEditedTimestampUsec: 1700001000000000
    })

    expect(note).toMatchObject({
      title: 'Weekend plan',
      textContent: 'First line\nSecond line',
      isChecklist: true
    })
    expect(note?.attachments).toHaveLength(1)
    expect(parseGoogleKeepTimestamp('1700000000000000')).toBe('2023-11-14T22:13:20.000Z')
  })

  it('builds markdown that keeps the title, body, checklist items and attachment placeholders', () => {
    const markdown = buildGoogleKeepMarkdown({
      title: 'Weekend plan',
      textContent: 'First line\nSecond line',
      listContent: [
        { text: 'Buy bread', isChecked: false },
        { text: 'Call Alice', isChecked: true }
      ],
      attachments: [{ filePath: 'keep/photo.png' }],
      createdAt: '2024-01-01T10:00:00.000Z',
      updatedAt: '2024-01-02T10:00:00.000Z',
      isChecklist: true
    })

    expect(markdown).toContain('title: "Weekend plan"')
    expect(markdown).toContain('type: "task"')
    expect(markdown).toContain('# Weekend plan')
    expect(markdown).toContain('First line')
    expect(markdown).toContain('- [ ] Buy bread')
    expect(markdown).toContain('- [x] Call Alice')
    expect(markdown).toContain('- Attachment: photo.png')
  })

  it('sanitizes unsafe note titles into safe filenames and headings', () => {
    expect(sanitizeFileStem('Project: Q4 / Goals?')).toBe('Project Q4 Goals')

    const markdown = buildGoogleKeepMarkdown({
      title: 'Project: Q4 / Goals?',
      textContent: 'Hello',
      listContent: [],
      attachments: [],
      createdAt: '2024-01-01T10:00:00.000Z',
      updatedAt: '2024-01-02T10:00:00.000Z',
      isChecklist: false
    })

    expect(markdown).toContain('title: "Project: Q4 / Goals?"')
    expect(markdown).toContain('# Project: Q4 / Goals?')
  })

  it('imports a real zipped Google Keep export', async() => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'elephantnote-keep-zip-test-'))
    const source = path.join(root, 'Takeout', 'Keep')
    const destination = path.join(root, 'vault', 'Imported')
    const zipPath = path.join(root, 'keep-export.zip')

    try {
      await fs.ensureDir(source)
      await fs.writeJson(path.join(source, 'first.json'), {
        title: 'Zip note',
        textContent: 'Imported from a real archive',
        createdTimestampUsec: 1700000000000000,
        userEditedTimestampUsec: 1700001000000000
      })
      execFileSync('zip', ['-qr', zipPath, '.'], { cwd: path.join(root, 'Takeout') })

      const result = await importGoogleKeepExport({
        sourcePath: zipPath,
        destinationPath: destination
      })

      expect(result.imported).toBe(1)
      expect(result.files).toHaveLength(1)
      expect(await fs.readFile(result.files[0], 'utf8')).toContain('Imported from a real archive')
    } finally {
      await fs.remove(root)
    }
  })
})
